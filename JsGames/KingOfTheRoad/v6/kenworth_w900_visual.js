import * as THREE from 'three';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CreateMirror } from './mirrors.js';
import { createSunVisor } from './sunvisor.js';
import { CreateChassi } from './chassi.js';

export function KenworthW900Visual() {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xbd0000, metalness: 0.6, roughness: 0.4 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
    const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.0 });
    const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.8 });

    const truck = new THREE.Group();
    const truckParts = {};

    const addPart = (name, object) => {
        object.castShadow = true;
        object.receiveShadow = true;
        truck.add(object);
        truckParts[name] = object;
    };

    const chassiW = 0.80;
    const chassiH = 0.25;
    const chassiL = 7.85;  // This will result in a total length of 7.90 m
    const chassiY = 1.30;
    const chassiZ = 0;
    addPart("chassi", CreateChassi(chassiW, chassiH, chassiL, [
        { length: 2.00, isFront: true, position: 3.23 },
        { length: 1.60, isFront: false, position: -2.15 },
        { length: 1.60, isFront: false, position: -3.25 }
    ]));
    truckParts.chassi.position.set(0, chassiY, chassiZ);

    const bumperW = 2.40;
    const bumperL = 0.10;
    const bumperZ = chassiZ + chassiL / 2;
    addPart("Parachoque", new THREE.Mesh(new RoundedBoxGeometry(bumperW, 0.50, bumperL, 4, 0.02), chromeMaterial));
    truckParts.Parachoque.position.set(0, 1.05, bumperZ);

    const grillY = 1.84;
    const grillL = 0.05;
    const grillH = 1.13;
    const grillZ = bumperZ + bumperL / 2 - grillL / 2;
    addPart("Grade", createGrille(grillH, 0.05, grillH, chromeMaterial));
    truckParts.Grade.position.set(0, grillY, grillZ);

    const emblemY = 2.36;
    const emblemZ = grillZ + grillL / 2 + 0.005;
    addPart("Emblem", createEmblem());
    truckParts.Emblem.position.set(0, emblemY, emblemZ);

    const hoodH = 1.13;
    const hoodW = 1.13;
    const hoodL = 1.90;
    const hoodY = chassiY + chassiH / 2 + hoodH / 2 - 0.15;
    const hoodZ = grillZ - hoodL / 2; //To reduce a bit the rounded corner 3.44;
    addPart("Capo", CreateHood(hoodW, hoodH, hoodL, bodyMaterial));
    truckParts.Capo.position.set(0, hoodY, hoodZ);

    const cabinH = 1.78;
    const cabinL = 1.18;
    const cabinW = 1.88;
    const cabinY = chassiY + chassiH / 2 + cabinH / 2;
    const cabinZ = hoodZ - hoodL / 2 - cabinL / 2 + 0.05;  // 5 is because of rounded corners
    const cabinGroup = new THREE.Group();
    const cabinMesh = new THREE.Mesh(new RoundedBoxGeometry(cabinW, cabinH, cabinL, 8, 0.1), bodyMaterial)
    cabinMesh.castShadow = true;
    cabinMesh.receiveShadow = true;
    cabinGroup.add(cabinMesh);

    const windShieldH = 0.6;
    const windShieldMesh = new THREE.Mesh(new RoundedBoxGeometry(cabinW - 0.2, windShieldH, 0.01, 8, 0.1), glassMaterial);
    windShieldMesh.position.z = cabinL / 2;
    windShieldMesh.position.y = cabinH / 2 - windShieldH / 2 - 0.2;
    cabinGroup.add(windShieldMesh);

    const sideWindowH = 0.6;
    const sideWindowL = 0.8;
    const sideWindowMesh = new THREE.Mesh(new RoundedBoxGeometry(cabinW + 0.02, sideWindowH, sideWindowL, 8, 0.02), glassMaterial);
    sideWindowMesh.position.z = cabinL / 2 - sideWindowL / 2 - 0.1;
    sideWindowMesh.position.y = cabinH / 2 - sideWindowH / 2 - 0.2;
    cabinGroup.add(sideWindowMesh);

    addPart("Cabine", cabinGroup);
    truckParts.Cabine.position.set(0, cabinY, cabinZ);

    const sleepH = 2.38;
    const sleepL = 2.00;
    const sleepW = 2.36;
    const sleepY = chassiY + chassiH / 2 + sleepH / 2;
    const sleepZ = cabinZ - cabinL / 2 - sleepL / 2 + 0.05;  // 5 is because of rounded corners
    const sleepGroup = new THREE.Group();
    const sleepMesh = new THREE.Mesh(new RoundedBoxGeometry(sleepW, sleepH, sleepL, 8, 0.1), bodyMaterial);
    sleepMesh.castShadow = true;
    sleepMesh.receiveShadow = true;
    sleepGroup.add(sleepMesh);

    const sleepWindowH = 0.93;
    const sleepWindowL = 0.61;
    const sleepWindowMesh = new THREE.Mesh(new RoundedBoxGeometry(sleepW + 0.02, sleepWindowH, sleepWindowL, 8, 0.02), glassMaterial);
    sleepWindowMesh.position.y = -(sleepH / 2 - sleepWindowH / 2 - 0.61);
    sleepWindowMesh.position.z = -(sleepL / 2 - sleepWindowL / 2 - 0.24);
    sleepGroup.add(sleepWindowMesh);

    addPart("MirrorLeft", CreateMirror(true));
    truckParts.MirrorLeft.position.set(0.96, 2.40, 2.04);
    addPart("mirrorRight", CreateMirror(false));
    truckParts.mirrorRight.position.set(-0.96, 2.40, 2.04);
    addPart("sunvisor", createSunVisor(1.90, 3, 45));
    truckParts.sunvisor.position.set(0, 3.13, 2.25);

    addPart("Leito", sleepGroup);
    truckParts.Leito.position.set(0, sleepY, sleepZ);

    const exaustR = 0.09;
    const exaustH = 3.38;
    const exaustY = chassiY - chassiH / 2 + exaustH / 2;
    const exaustZ = sleepZ + sleepL / 2 + exaustR;
    const exaustX = cabinW / 2 + exaustR;
    const stackGeo = new THREE.CylinderGeometry(exaustR, exaustR, exaustH, 16);
    addPart("exaustRight", new THREE.Mesh(stackGeo, chromeMaterial));
    truckParts.exaustRight.position.set(-exaustX, exaustY, exaustZ);
    addPart("exaustLeft", new THREE.Mesh(stackGeo, chromeMaterial));
    truckParts.exaustLeft.position.set(exaustX, exaustY, exaustZ);

    const tankR = 0.33;
    const tankL = 1.73;
    const tankX = sleepW / 2 - tankR;
    const tankY = sleepY - sleepH / 2 - tankR;
    const tankZ = sleepZ;
    const tankGeo = new THREE.CylinderGeometry(tankR, tankR, tankL, 32);
    const leftTankMesh = new THREE.Mesh(tankGeo, chromeMaterial);
    leftTankMesh.castShadow = true;
    leftTankMesh.receiveShadow = true;
    leftTankMesh.rotation.x = Math.PI / 2;
    addPart("leftTank", leftTankMesh);
    truckParts.leftTank.position.set(tankX, tankY, tankZ);
    const rightTankMesh = leftTankMesh.clone();
    addPart("rightTank", rightTankMesh);
    truckParts.rightTank.position.set(-tankX, tankY, tankZ);

    const doorStepX = hoodW / 2;
    const doorStepY = cabinY - cabinH / 2;
    const doorStepZ = 1.85;
    addPart("doorStepLeft", CreateDoorSteps(true));
    truckParts.doorStepLeft.position.set(doorStepX, doorStepY, doorStepZ);
    addPart("doorStepRight", CreateDoorSteps(false));
    truckParts.doorStepRight.position.set(-doorStepX, doorStepY, doorStepZ);

    const airFilterX = hoodW / 2;
    const airFilterY = hoodY + hoodH / 2;
    const airFilterZ = cabinZ + cabinL / 2;
    addPart("airFilterRight", CreateAirFilter(true, chromeMaterial, rubberMaterial));
    truckParts.airFilterRight.position.set(-airFilterX, airFilterY, airFilterZ);
    addPart("airFilterLeft", CreateAirFilter(false, chromeMaterial, rubberMaterial));
    truckParts.airFilterLeft.position.set(airFilterX, airFilterY, airFilterZ);

    const fenderW = 0.58;
    const fenderY = 1.3;
    const fenderZ = bumperZ + bumperL / 2 - 0.76;
    addPart("fenderRight", createFender(fenderW, bodyMaterial));
    truckParts.fenderRight.position.set(-0.55, fenderY, fenderZ);
    addPart("fenderLeft", createFender(fenderW, bodyMaterial));
    truckParts.fenderLeft.position.set(1.15, fenderY, fenderZ);

    const supportW = 0.48;
    const supportH = 0.26;
    const supportX = 0.78;
    const supportY = 1.57;
    const supportZ = fenderZ + 0.51;
    const supportGeo = new RoundedBoxGeometry(supportW, supportH, 0.26, 4, 0.01);
    addPart("ligtSupportRight", new THREE.Mesh(supportGeo, bodyMaterial));
    truckParts.ligtSupportRight.position.set(-supportX, supportY, supportZ);
    addPart("ligtSupportLeft", new THREE.Mesh(supportGeo, bodyMaterial));
    truckParts.ligtSupportLeft.position.set(supportX, supportY, supportZ);

    const headLightBoarder = 0.02;
    const headLightW = 0.38;
    const headLightH = 0.14;
    const headLightX = supportX + supportW / 2 - headLightBoarder - headLightW / 2;
    const headLightY = supportY + supportH / 2 - headLightBoarder - headLightH / 2;
    const headLightZ = supportZ + 0.1;
    addPart("headLightRight", CreateHeadLights(headLightW, headLightH, headLightBoarder, chromeMaterial));
    truckParts.headLightRight.position.set(-headLightX, headLightY, headLightZ);
    addPart("headLightLeft", CreateHeadLights(headLightW, headLightH, headLightBoarder, chromeMaterial));
    truckParts.headLightLeft.position.set(headLightX, headLightY, headLightZ);

    addPart("fifthWheel", createFifthWheel());
    const fifthWheelY = chassiY + chassiH / 2 + 0.27;
    const fifthWheelZ = chassiL / 2 - 0.7 - 0.38;
    truckParts.fifthWheel.position.set(0, fifthWheelY, -fifthWheelZ);

    const wrapper = new THREE.Group();
    wrapper.add(truck);
    truck.position.y = -1.2;
    truck.position.z += -0.03;
    return wrapper;
}


function CreateDoorSteps(leftSide) {
    const diamondTexture = createDiamondPlateTexture();
    diamondTexture.repeat.set(1, 1);

    const metalMaterial = new THREE.MeshStandardMaterial({
        map: diamondTexture,
        metalness: 0.9,
        roughness: 0.4,
        color: 0xc0c0c0, // Silver
    });

    const stepsGroup = new THREE.Group();

    const bkgndH = 0.55;
    const bkgndW = 0.05;
    const bkgndL = 1.55;
    const background = new THREE.Mesh(new THREE.BoxGeometry(bkgndW, bkgndH, bkgndL), metalMaterial);

    const stepH = 0.05;
    const stepL = 0.90;
    const stepZ = 0.20;
    const bottonW = 0.50;
    const topW = 0.40;
    const top = new THREE.Mesh(new THREE.BoxGeometry(topW, stepH, stepL), metalMaterial);
    const botton = new THREE.Mesh(new THREE.BoxGeometry(bottonW, stepH, stepL), metalMaterial);

    background.position.y = -bkgndH / 2;
    top.position.y = -0.15;
    top.position.z = -stepZ;
    botton.position.y = -2 * bkgndH / 2 + stepH / 2;
    botton.position.z = -stepZ;

    if (leftSide) {
        background.position.x = bkgndW / 2;
        top.position.x = topW / 2;
        botton.position.x = bottonW / 2;
    } else {
        background.position.x = -bkgndW / 2;
        top.position.x = -topW / 2;
        botton.position.x = -bottonW / 2;
    }

    stepsGroup.add(background);
    stepsGroup.add(top);
    stepsGroup.add(botton);
    return stepsGroup;
}


function createDiamondPlateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');

    // Fill background
    const backgroundColor = '#b8b8b8';
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, 128, 128);

    // Draw the pattern
    context.fillStyle = '#d1d1d1';
    context.strokeStyle = '#a0a0a0';
    context.lineWidth = 1;

    const step = 16;
    for (let i = -step; i < 128 + step; i += step) {
        for (let j = -step; j < 128 + step; j += step) {
            context.save();
            context.translate(i, j);
            context.rotate(Math.PI / 4);
            context.fillRect(-step / 4, -step / 8, step / 2, step / 4);
            context.strokeRect(-step / 4, -step / 8, step / 2, step / 4);
            context.restore();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}


function CreateAirFilter(right, chromeMaterial, rubberMaterial) {
    const airFilterGroup = new THREE.Group();

    const radius = 0.17;
    const canisterH = 0.65;
    const strapW = 0.01;
    const strapH = 0.03

    const canisterGeometry = new THREE.CylinderGeometry(radius, radius, canisterH, 64);
    const canisterMesh = new THREE.Mesh(canisterGeometry, chromeMaterial);
    canisterMesh.position.y = -canisterH / 2;
    airFilterGroup.add(canisterMesh);

    const topCapGeometry = new THREE.CylinderGeometry(radius + strapW, radius + strapW, strapH, 64);
    const topCapMesh = new THREE.Mesh(topCapGeometry, rubberMaterial);
    topCapMesh.position.y = -strapH / 2 - 0.01;
    airFilterGroup.add(topCapMesh);

    const bottomCapMesh = topCapMesh.clone();
    bottomCapMesh.position.y = -canisterH + strapH / 2 + 0.01;
    airFilterGroup.add(bottomCapMesh);

    const middleStrap = topCapMesh.clone();
    middleStrap.position.y = -canisterH / 2;
    airFilterGroup.add(middleStrap);

    const bottonStrap = topCapMesh.clone();
    bottonStrap.position.y = -canisterH * 0.75;
    airFilterGroup.add(bottonStrap);

    const addimitionMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 64), chromeMaterial);
    addimitionMesh.rotation.z = -Math.PI / 2;
    addimitionMesh.rotation.y = Math.PI / 2;
    addimitionMesh.position.y = -canisterH / 4;
    addimitionMesh.position.z = radius;
    airFilterGroup.add(addimitionMesh);

    if (right) {
        airFilterGroup.rotation.y = Math.PI / 4;
        airFilterGroup.position.x = -radius;
    } else {
        airFilterGroup.rotation.y = -Math.PI / 4;
        airFilterGroup.position.x = radius;
    }
    airFilterGroup.position.z = radius;
    const airFilterGroup2 = new THREE.Group();
    airFilterGroup2.add(airFilterGroup);
    return airFilterGroup2;
}


function createFender(fenderW, bodyMaterial) {
    const fenderGroup = new THREE.Group();
    const mainGroup = new THREE.Group();

    const fenderShape = new THREE.Shape();
    const outerRadius = 0.78;
    const innerRadius = outerRadius - 0.20;
    fenderShape.absarc(0, 0, outerRadius, -Math.PI * 0.39, Math.PI * 0.54, false);
    fenderShape.absarc(0, 0, innerRadius, Math.PI * 0.55, -Math.PI * 0.35, true);

    const extrudeSettings = { steps: 1, depth: fenderW, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelOffset: 0, bevelSegments: 2 };
    const fenderGeo = new THREE.ExtrudeGeometry(fenderShape, extrudeSettings);
    const fender = new THREE.Mesh(fenderGeo, bodyMaterial);
    fender.castShadow = true;
    fender.receiveShadow = true;
    fender.position.z = -extrudeSettings.depth / 2;
    fender.rotation.y = -Math.PI / 2;
    mainGroup.add(fender);
    mainGroup.rotation.x = -Math.PI / 2;
    fenderGroup.add(mainGroup);

    return fenderGroup;
}


function CreateHeadLights(housingW, housingH, boarders, chromeMaterial) {
    const lightW = (housingW - 3 * boarders) / 2;
    const lightH = housingH - 2 * boarders;
    const LightX = lightW / 2 + boarders / 2;
    const LightZ = 0.05;
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0c4, emissiveIntensity: 0.8 });

    const headlightAssembly = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(housingW, housingH, 0.10), chromeMaterial);
    headlightAssembly.add(housing);

    const lightSquareGeo = new THREE.BoxGeometry(lightW, lightH, 0.03);
    const leftLight = new THREE.Mesh(lightSquareGeo, lightMaterial);
    leftLight.position.set(LightX, 0, LightZ);
    headlightAssembly.add(leftLight);
    const rightLightMesh = new THREE.Mesh(lightSquareGeo, lightMaterial);
    rightLightMesh.position.set(-LightX, 0, LightZ);
    headlightAssembly.add(rightLightMesh);
    return headlightAssembly;
}


function createFifthWheel() {
    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x4B4B4B, // Cinza escuro metálico
        metalness: 0.9,
        roughness: 0.4,
    });

    const fifthWheelGroup = new THREE.Group();

    const plateShape = new THREE.Shape();
    const outerRadius = 0.35;
    const innerRadius = 0.10;
    plateShape.absarc(0, 0, outerRadius, -Math.PI * 0.85, Math.PI * 0.85, false);
    plateShape.absarc(0, 0, innerRadius, Math.PI * 0.67, -Math.PI * 0.67, true);

    const extrudeSettings = {
        steps: 1,
        depth: 0.05, // Espessura do prato
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.05,
        bevelSegments: 2,
    };

    const plateGeometry = new THREE.ExtrudeGeometry(plateShape, extrudeSettings);
    const mainPlate = new THREE.Mesh(plateGeometry, metalMaterial);
    mainPlate.rotation.z = Math.PI / 2;
    mainPlate.rotation.x = Math.PI / 2.2;

    mainPlate.castShadow = true;
    fifthWheelGroup.add(mainPlate);

    const support = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.1, 0.1), metalMaterial);
    support.position.y = -0.07;
    support.position.z = 0.15;
    fifthWheelGroup.add(support);

    const baseX = 0.40 - 0.15 / 2;
    let base = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 1.5 * outerRadius), metalMaterial);
    base.position.y = -0.07 - 0.13;
    base.position.x = baseX;
    fifthWheelGroup.add(base);

    base = base.clone();
    base.position.x = -baseX;
    fifthWheelGroup.add(base);
    return fifthWheelGroup;
}


function createGrille(frameWidth, frameDepth, frameHeight, chromeMaterial) {
    const createGrilleTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        // Background of the grille mesh
        context.fillStyle = '#111111';
        context.fillRect(0, 0, 128, 128);

        // Grille lines
        context.strokeStyle = '#444444';
        context.lineWidth = 2;

        const step = 8;
        for (let i = context.lineWidth / 2; i < 128; i += step) {
            context.beginPath();
            context.moveTo(i, 0);
            context.lineTo(i, 128);
            context.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 12); // Repeat texture for a denser look
        return texture;
    };

    const grilleGroup = new THREE.Group();

    const frameThickness = 0.05;
    const topFrameThickness = 0.20;
    const innerWidth = frameWidth - frameThickness;
    const innerHeight = frameHeight;

    const grilleTexture = createGrilleTexture();
    const backgroundPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(innerWidth, innerHeight),
        new THREE.MeshBasicMaterial({ map: grilleTexture })
    );
    backgroundPlane.position.z = 0.005;
    grilleGroup.add(backgroundPlane);

    // Outer Frame
    const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, frameThickness, frameDepth), chromeMaterial);
    bottomFrame.position.y = -frameHeight / 2 + frameThickness / 2;
    grilleGroup.add(bottomFrame);

    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth), chromeMaterial);
    leftFrame.position.x = -frameWidth / 2 + frameThickness / 2;
    grilleGroup.add(leftFrame);

    const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth), chromeMaterial);
    rightFrame.position.x = frameWidth / 2 - frameThickness / 2;
    grilleGroup.add(rightFrame);

    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, topFrameThickness, frameDepth), chromeMaterial);
    topFrame.position.y = frameHeight / 2 - topFrameThickness / 2;
    grilleGroup.add(topFrame);

    const frisoH = 0.026;
    const friso = new THREE.Mesh(new THREE.BoxGeometry(0.07, frisoH, frameDepth), chromeMaterial);
    friso.position.y = topFrame.position.y + topFrameThickness / 2 + frisoH / 2;
    grilleGroup.add(friso);

    // Fewer vertical bars for depth
    const barCount = 6; // Reduced from 20
    const barWidth = 0.01;
    const barSpacing = (innerWidth / 2) / (barCount + 1);

    // Center Bar
    const centerBar = new THREE.Mesh(new THREE.BoxGeometry(barWidth * 2, innerHeight, frameDepth * 0.8), chromeMaterial);
    grilleGroup.add(centerBar);

    // Left and Right Bars
    for (let i = 1; i <= barCount; i++) {
        const barGeometry = new THREE.BoxGeometry(barWidth, innerHeight, frameDepth * 0.8);

        const rightBar = new THREE.Mesh(barGeometry, chromeMaterial);
        rightBar.position.x = i * barSpacing;
        grilleGroup.add(rightBar);

        const leftBar = new THREE.Mesh(barGeometry, chromeMaterial);
        leftBar.position.x = -i * barSpacing;
        grilleGroup.add(leftBar);
    }

    return grilleGroup;
}


function CreateHood(hoodW, hoodH, hoodL, bodyMaterial) {
    const group = new THREE.Group();
    const hood = new THREE.Mesh(new RoundedBoxGeometry(hoodW, hoodH, hoodL, 4, 0.05), bodyMaterial);
    group.add(hood);
    const frisoW = 0.07;
    const frisoH = 0.04;
    const friso = new THREE.Mesh(new RoundedBoxGeometry(frisoW, frisoH, hoodL, 4, 0.01), bodyMaterial);
    friso.position.y = hoodH / 2;
    group.add(friso);
    return group;
}


function createEmblem() {
    const group = new THREE.Group();

    // Materiais
    const redMaterial = new THREE.MeshStandardMaterial({ color: 0xB40404, metalness: 0.3, roughness: 0.4 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xEAEAEA, metalness: 0.3, roughness: 0.4 });

    const emblemDepth = 0.01;
    const redZ = 0.001;

    // --- Parte Central (Círculo) ---
    // Círculo vermelho de fundo
    const redCircleGeom = new THREE.CylinderGeometry(0.05, 0.05, emblemDepth, 64);
    const redCircle = new THREE.Mesh(redCircleGeom, redMaterial);
    redCircle.rotation.x = Math.PI / 2;
    redCircle.position.z = redZ;
    group.add(redCircle);

    // Anel branco sobre o círculo
    const whiteRingShape = new THREE.Shape();
    whiteRingShape.absarc(0, 0, 0.041, 0, Math.PI * 2, false);
    const ringHole = new THREE.Path();
    ringHole.absarc(0, 0, 0.038, 0, Math.PI * 2, true);
    whiteRingShape.holes.push(ringHole);
    const whiteRingGeom = new THREE.ExtrudeGeometry(whiteRingShape, { depth: emblemDepth, bevelEnabled: false });
    const whiteRing = new THREE.Mesh(whiteRingGeom, whiteMaterial);
    whiteRing.position.z = -emblemDepth / 2 + 2 * redZ;
    group.add(whiteRing);

    // --- Retângulo com listras ---
    const lowerPartShape = new THREE.Shape();
    const lowerWidth = 0.065;
    const lowerHeight = 0.20;
    lowerPartShape.moveTo(-lowerWidth / 2, 0);
    lowerPartShape.lineTo(-lowerWidth / 2, -lowerHeight);
    lowerPartShape.lineTo(lowerWidth / 2, -lowerHeight);
    lowerPartShape.lineTo(lowerWidth / 2, 0);
    lowerPartShape.lineTo(-lowerWidth / 2, 0);

    const lowerPartGeom = new THREE.ExtrudeGeometry(lowerPartShape, { depth: emblemDepth, bevelEnabled: false });
    const lowerPart = new THREE.Mesh(lowerPartGeom, whiteMaterial);
    lowerPart.position.y = lowerHeight / 3;
    lowerPart.position.z = -emblemDepth / 2;
    group.add(lowerPart);

    // Listras vermelhas 
    const stripeWidth = 0.012;
    const stripeH = lowerHeight - 0.002;
    const stripeGeom = new THREE.BoxGeometry(stripeWidth, stripeH, emblemDepth);

    const stripe1 = new THREE.Mesh(stripeGeom, redMaterial);
    stripe1.position.set(0, lowerPart.position.y - lowerHeight / 2, redZ);
    group.add(stripe1);

    const stripe2 = stripe1.clone();
    stripe2.position.x = -(stripeWidth + 0.009);
    group.add(stripe2);

    const stripe3 = stripe1.clone();
    stripe3.position.x = stripeWidth + 0.009;
    group.add(stripe3);
    return group;
}
