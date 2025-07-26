import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function CreateMirror(lefSide) {
    const assemblyGroup = new THREE.Group();
    const hoopRadius = 0.01;

    // --- Materiais ---
    const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.0 });
    const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const mirrorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.0 });

    const height = 0.66;
    const length = 0.46;
    const cornerRadius = 0.05;
    const verticalmiddleBarX = 0.3;

    const CreateBar = (length) => {
        const verticalGeo = new THREE.CylinderGeometry(hoopRadius, hoopRadius, length, 24);
        const verticalCylinder = new THREE.Mesh(verticalGeo, chromeMaterial);
        assemblyGroup.add(verticalCylinder);
        return verticalCylinder;
    }

    const CreateCorner = () => {
        const cornerGeo = new THREE.TorusGeometry(cornerRadius, hoopRadius, 16, 32, Math.PI / 2);
        const corner = new THREE.Mesh(cornerGeo, chromeMaterial);
        assemblyGroup.add(corner);
        return corner;
    }

    const CreateBase = () => {
        const geo = new RoundedBoxGeometry(0.05, 0.05, 4*hoopRadius, 1, 0.007);
        const mesh = new THREE.Mesh(geo, chromeMaterial);
        assemblyGroup.add(mesh);
        return mesh;
    }

    // ------------------------------------------------------
    // Building the Frame 
    const verticalSectionLength = height - 2 * cornerRadius;
    CreateBar(verticalSectionLength).position.set(length, height / 2, 0);

    const horizontalSectionLength = length - cornerRadius;
    const horizontalSection = CreateBar(horizontalSectionLength);
    horizontalSection.rotation.z = Math.PI / 2;
    horizontalSection.position.set(horizontalSectionLength / 2, height, 0);

    const bottonHorizontalSection = CreateBar(horizontalSectionLength);
    bottonHorizontalSection.rotation.z = Math.PI / 2;
    bottonHorizontalSection.position.set(horizontalSectionLength / 2, 0, 0);

    const topCorner = CreateCorner();
    topCorner.position.set(length - cornerRadius, height - cornerRadius, 0);
    const botCorner = CreateCorner();
    botCorner.position.set(length - cornerRadius, cornerRadius, 0);
    botCorner.rotation.z = -Math.PI / 2;

    const topBase = CreateBase();
    topBase.position.set(0, height, 0);
    const bopBase = CreateBase();
    bopBase.position.set(0, 0, 0);

    const middleBar = CreateBar(height);
    middleBar.position.set(length, height / 2, 0);
    middleBar.position.set(verticalmiddleBarX, height / 2, 0);

    const diagStartPoint = new THREE.Vector3(0, height, 0);
    const diagEndPoint = new THREE.Vector3(verticalmiddleBarX, 0, 0);
    const diagVector = new THREE.Vector3().subVectors(diagEndPoint, diagStartPoint);
    const diagLength = diagVector.length();
    const diagBar = CreateBar(diagLength);
    diagBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diagVector.clone().normalize());
    diagBar.position.copy(diagStartPoint).add(diagEndPoint).multiplyScalar(0.5);
    assemblyGroup.add(diagBar);

    const topBase2 = topBase.clone();
    topBase2.position.z = lefSide ? topBase2.position.z - 0.4 : topBase2.position.z + 0.4;
    assemblyGroup.add(topBase2);

    const braceStartPoint = new THREE.Vector3(verticalmiddleBarX, height, 0);
    const braceEndPoint = topBase2.position;
    const braceVector = new THREE.Vector3().subVectors(braceStartPoint, braceEndPoint);
    const braceBarGeo = new THREE.CylinderGeometry(hoopRadius, hoopRadius, braceVector.length(), 24);
    const braceBar = new THREE.Mesh(braceBarGeo, chromeMaterial);
    braceBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), braceVector.clone().normalize());
    braceBar.position.copy(braceStartPoint).add(braceEndPoint).multiplyScalar(0.5);
    assemblyGroup.add(braceBar);

    // Mirror
    const mirrorGroup = new THREE.Group();
    const rectWidth = 0.25;
    const rectHeight = 0.6;
    const rectDepth = 0.05;
    const rectBoarder = 0.03;

    const mirrorBase = topBase.clone();
    mirrorBase.position.set(0, 0, 0);
    mirrorGroup.add(mirrorBase);

    const rectHousingZ = -(rectDepth / 2 + 2 * hoopRadius);
    const rectHousingGeo = new RoundedBoxGeometry(rectWidth, rectHeight, rectDepth, 1.3, 0.02);
    const rectHousing = new THREE.Mesh(rectHousingGeo, housingMaterial);
    rectHousing.position.z = rectHousingZ;
    mirrorGroup.add(rectHousing);

    const mirrorPaneGeo = new THREE.PlaneGeometry(rectWidth - 2 * rectBoarder, rectHeight - 2 * rectBoarder);
    const mirrorPane = new THREE.Mesh(mirrorPaneGeo, mirrorMaterial);
    mirrorPane.position.z = rectHousingZ -(rectDepth/2 + 0.001);
    mirrorPane.rotation.y = Math.PI;
    mirrorGroup.add(mirrorPane);

    mirrorGroup.position.set(length, height / 2, 0);
    assemblyGroup.add(mirrorGroup);

    if (!lefSide) {
        assemblyGroup.rotation.y = Math.PI;
        mirrorGroup.rotation.y = Math.PI;
    }

    assemblyGroup.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return assemblyGroup;
}


