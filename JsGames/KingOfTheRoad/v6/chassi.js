import * as THREE from 'three';

/***
 * 
 * @param {*} chassiWidht 
 * @param {*} chassiHeight 
 * @param {*} chassiLeght 
 * @param {*} axles: A tuple in the format: {isFront, length, position}
 */
export function CreateChassi(chassiWidht, chassiHeight, chassiLeght, axles) {
    const group = new THREE.Group();
    const parts = {};
    const addPart = (name, object) => {
        object.castShadow = true;
        object.receiveShadow = true;
        group.add(object);
        parts[name] = object;
    };

    const chassisMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.9,
        roughness: 0.4
    });

    addPart("frame", CreateFrame(chassiWidht, chassiHeight, chassiLeght, chassisMaterial));

    axles.forEach(axleConfig => {
        let axle;
        if (axleConfig.isFront) {
            axle = CreateFrontAxleSpring(chassiWidht, axleConfig.length, chassisMaterial);
        } else {
            axle = CreateRearAxleSpring(chassiWidht, axleConfig.length, chassisMaterial);
        }
        axle.position.z = axleConfig.position;
        axle.position.y = -chassiHeight / 2;
        addPart("axle", axle);
    });

    return group;
}

function CreateFrame(chassiW, chassiH, chassiL, chassisMaterial) {
    const frame = new THREE.Group();

    const longarinaThickness = 0.08;
    const longarinaX = chassiW / 2 - longarinaThickness / 2;
    const longarina = new THREE.Mesh(new THREE.BoxGeometry(longarinaThickness, chassiH, chassiL), chassisMaterial);
    longarina.position.x = longarinaX;
    frame.add(longarina);
    const longarina2 = longarina.clone();
    longarina2.position.x = -longarinaX;
    frame.add(longarina2);

    const travessaPace = 2.0;
    const travessaW = chassiW - 2 * longarinaThickness;
    const travessa = new THREE.Mesh(new THREE.BoxGeometry(travessaW, chassiH, longarinaThickness), chassisMaterial);
    for (let zPos = -chassiL / 2 + longarinaThickness / 2; zPos < chassiL / 2; zPos += travessaPace) {
        const trav = travessa.clone();
        trav.position.z = zPos;
        frame.add(trav);
    }

    const lightRadius = 0.05;
    const lightPace = 0.03;
    let light = CreateLight(lightRadius);
    light.position.z = -chassiL / 2;
    light.position.x = chassiW / 2 - lightRadius - lightPace;
    frame.add(light);

    light = light.clone();
    light.position.x -= (2 * lightRadius + lightPace);
    frame.add(light);

    light = light.clone();
    light.position.x = -chassiW / 2 + lightRadius + lightPace;
    frame.add(light);

    light = light.clone();
    light.position.x += (2 * lightRadius + lightPace);
    frame.add(light);

    return frame;
}

function CreateLight(radius) {
    const redLightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, roughness: 0.4 });
    const light = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.02, 16), redLightMaterial);
    light.rotateX(Math.PI / 2);
    return light;
}

function CreateFrontAxleSpring(chassiW, axelLength, chassisMaterial) {
    const group = new THREE.Group();
    const springL = CreateRearSpring(chassisMaterial);
    const springX = chassiW / 2 - 0.05;
    springL.position.x = springX;
    group.add(springL);

    const springR = CreateRearSpring(chassisMaterial);
    springR.position.x = -springX;
    group.add(springR);

    const axleRadius = 0.07;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(axleRadius, axleRadius, axelLength, 32), chassisMaterial);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = -0.25;
    group.add(axle);

    return group;
}

function CreateRearAxleSpring(chassiW, axelLength, chassisMaterial) {
    const group = new THREE.Group();
    const springL = CreateRearSpring(chassisMaterial);
    const springX = chassiW / 2 - 0.05;
    springL.position.x = springX;
    group.add(springL);

    const springR = CreateRearSpring(chassisMaterial);
    springR.position.x = -springX;
    group.add(springR);

    const axle = CreateRearAxle(axelLength, chassisMaterial);
    axle.position.y = -0.25;
    group.add(axle);

    return group;
}

function CreateRearAxle(length, chassisMaterial) {
    const axleGroup = new THREE.Group();
    const sateliteRadius = 0.20;
    const satelite = new THREE.Mesh(new THREE.SphereGeometry(sateliteRadius, 32, 32), chassisMaterial);
    axleGroup.add(satelite);

    const axleRadius = 0.1;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(axleRadius, axleRadius, length, 32), chassisMaterial);
    axle.rotation.z = Math.PI / 2;
    axleGroup.add(axle);

    const ringRadius = sateliteRadius + 0.03;
    const ringLength = 0.9 * axleRadius * 2;
    const sateliteRing = new THREE.Mesh(new THREE.CylinderGeometry(ringRadius, ringRadius, ringLength, 32), chassisMaterial);
    sateliteRing.rotation.x = Math.PI / 2;
    axleGroup.add(sateliteRing);

    // Parafusos nos cubos
    const boltRadius = 0.01;
    const boltPosRadius = (sateliteRadius + ringRadius) / 2 - boltRadius;
    const numBolts = 12;
    for (let i = 0; i < numBolts; i++) {
        const angle = (i / numBolts) * Math.PI * 2;
        const boltGeometry = new THREE.CylinderGeometry(0.01, 0.01, ringLength + 0.02, 8);
        const bolt = new THREE.Mesh(boltGeometry, new THREE.MeshStandardMaterial({ color: 0x777777 }));
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(Math.sin(angle) * boltPosRadius, Math.cos(angle) * boltPosRadius, 0);
        axleGroup.add(bolt);
    }

    return axleGroup;
}

function CreateRearSpring(darkMetalMaterial) {
    const rearSpringArch = 0.5;
    const rearSpringHeight = 0.6;
    return createLeafSpring(8, 5, 0.5, rearSpringHeight, rearSpringArch, darkMetalMaterial);
}

function createLeafSpring(length, numLeaves, width, totalHeight, archHeight, darkMetalMaterial) {
    const scaleFactor = 0.16;

    const springMaterial = new THREE.MeshStandardMaterial({
        color: 0x404040,
        metalness: 0.8,
        roughness: 0.6
    });

    const springGroup = new THREE.Group();
    const leafHeight = totalHeight / numLeaves;

    // Cria cada lâmina do feixe
    for (let i = 0; i < numLeaves; i++) {
        const currentLength = length - (i * length * 0.12);
        const leafGeometry = new THREE.BoxGeometry(width, leafHeight, currentLength, 1, 1, Math.ceil(currentLength * 2));

        const positions = leafGeometry.attributes.position;
        const halfLength = currentLength / 2;

        // Deforma a geometria para criar o arco
        for (let j = 0; j < positions.count; j++) {
            const z = positions.getZ(j);
            // Fórmula parabólica para o arco
            const yOffset = archHeight * (1 - Math.pow(z / halfLength, 2));
            positions.setY(j, positions.getY(j) - yOffset);
        }
        positions.needsUpdate = true;
        leafGeometry.computeVertexNormals();

        const leaf = new THREE.Mesh(leafGeometry, springMaterial);
        leaf.position.y = -(i * (leafHeight + 0.02)); // Empilha as lâminas
        leaf.castShadow = true;
        springGroup.add(leaf);
    }

    // Adiciona grampos "U" que prendem o eixo (simplificado)
    const uBoltPlateGeometry = new THREE.BoxGeometry(width + 0.2, 0.15, 1.2);
    const uBoltPlate = new THREE.Mesh(uBoltPlateGeometry, darkMetalMaterial);
    uBoltPlate.position.y = -archHeight - totalHeight - 0.4;
    springGroup.add(uBoltPlate);

    const uBoltSideGeom = new THREE.BoxGeometry(0.15, totalHeight + archHeight, 0.15);

    const uBoltFrontLeft = new THREE.Mesh(uBoltSideGeom, darkMetalMaterial);
    uBoltFrontLeft.position.set(-(width / 2), -archHeight - totalHeight / 2, -0.3);
    springGroup.add(uBoltFrontLeft);
    const uBoltBackLeft = uBoltFrontLeft.clone();
    uBoltBackLeft.position.z = 0.3;
    springGroup.add(uBoltBackLeft);

    const uBoltFrontRight = new THREE.Mesh(uBoltSideGeom, darkMetalMaterial);
    uBoltFrontRight.position.set(width / 2, -archHeight - totalHeight / 2, -0.3);
    springGroup.add(uBoltFrontRight);
    const uBoltBackRight = uBoltFrontRight.clone();
    uBoltBackRight.position.z = 0.3;
    springGroup.add(uBoltBackRight);

    springGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    return springGroup;
}

