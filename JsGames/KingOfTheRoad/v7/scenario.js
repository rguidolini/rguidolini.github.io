import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

let cachedConeTemplate = null;

export class Scenario {
    constructor() {
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.parkingZone = null;
        this.cones = [];
        this.walls = [];
        this.warehouseBody = null;

        this.scene.background = new THREE.Color(0x87ceeb);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
    }

    Initialize(world) {
        this.world = world;
        this.scene.environment = createProceduralEnvironment(this.renderer);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        this.scene.fog = new THREE.Fog(0x87CEEB, 60, 120);
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(20, 30, -20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.top = 35;
        dirLight.shadow.camera.bottom = -35;
        dirLight.shadow.camera.left = -35;
        dirLight.shadow.camera.right = 35;
        dirLight.shadow.camera.near = 5;
        dirLight.shadow.camera.far = 90;
        this.scene.add(dirLight);

        createGround(this.scene, world);
        this.addParkingZone(3.5, 8.5, 0, 0);

        const wallLength = 50;
        const longWallLength = 60;
        const yOffset = 15;
        const yPos = -wallLength / 2 + yOffset;
        this.walls.push(createBoundaryWall(0, yOffset, longWallLength, true, this.scene, world));  // Front
        this.walls.push(createBoundaryWall(0, -wallLength + yOffset, longWallLength, true, this.scene, world));  // Back
        this.walls.push(createBoundaryWall(-longWallLength / 2, yPos, wallLength, false, this.scene, world));  // Right
        this.walls.push(createBoundaryWall(longWallLength / 2, yPos, wallLength, false, this.scene, world));  // Left

        createDistantCity(this.scene);
        this.warehouseBody = createWarehouse(-25, 2.5, Math.PI / 2, this.scene, world);
    }

    addParkingZone(sizeX, sizeZ, posX, posZ) {
        this.parkingZone = createParkingZone(this.scene, sizeX, sizeZ, posX, posZ);
        this.createCone(sizeX / 2 + posX, sizeZ / 2 + posZ);
        this.createCone(-sizeX / 2 + posX, sizeZ / 2 + posZ);
        this.createCone(sizeX / 2 + posX, -sizeZ / 2 + posZ);
        this.createCone(-sizeX / 2 + posX, -sizeZ / 2 + posZ);
    }

    resetParkingZone(sizeX, sizeZ, posX, posZ) {
        if (this.parkingZone) {
            this.scene.remove(this.parkingZone);
            this.parkingZone.geometry.dispose();
        }
        this.cones.forEach((cone) => {
            this.scene.remove(cone.mesh);
            this.world.remove(cone.body);
        });
        this.cones = [];
        this.addParkingZone(sizeX, sizeZ, posX, posZ);
    }

    createCone(x, z) {
        const coneHeight = 1.0;
        const coneRadius = 0.25;
        let cone = {};

        const coneMesh = createConeVisual(coneHeight, coneRadius);
        coneMesh.position.set(x, 0, z);
        this.scene.add(coneMesh);
        cone.mesh = coneMesh;

        const coneBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Cylinder(coneRadius + 0.01, 0.02, coneHeight + 0.05, 12),
        });
        const axis = new CANNON.Vec3(1, 0, 0); // Y axis
        const angle = Math.PI / 2;
        coneBody.quaternion.setFromAxisAngle(axis, angle);
        coneBody.position.copy(coneMesh.position);
        coneBody.position.y = coneHeight / 2;
        this.world.addBody(coneBody);
        cone.body = coneBody;

        this.cones.push(cone);
    }

    addConeCollisions(vehicle, level_manager) {
        this.cones.forEach((cone) => {
            cone.body.addEventListener("collide", (event) => {
                if (!level_manager.Ended()) {
                    if (event.body === vehicle.chassisBody) {
                        level_manager.failedLevel("You crashed into a cone.");
                    }
                }
            });
        });
    }

    SetUpCollisions(level_manager) {
        this.cones.forEach((cone) => {
            cone.body.addEventListener("collide", (event) => {
                if (!level_manager.Ended()) {
                    level_manager.failedLevel("You crashed into a cone.");
                }
            });
        });

        this.walls.forEach((wall) => {
            wall.addEventListener("collide", (event) => {
                if (!level_manager.Ended()) {
                    level_manager.failedLevel("You crashed into a wall.");
                }
            });
        });

        this.warehouseBody.addEventListener('collide', (event) => {
            if (!level_manager.Ended()) {
                level_manager.failedLevel("You crashed into the Warehouse");
            }
        });
    }

    Update(camera) {
        this.renderer.render(this.scene, camera);
    }
}


function createGround(scene, world) {
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x909090 });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const concreteMaterial = new CANNON.Material("concreteMaterial");
    const groundShape = new CANNON.Box(new CANNON.Vec3(50, 0.1, 50));
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        material: concreteMaterial,
    });
    groundBody.position.y = -0.1;
    world.addBody(groundBody);

    // const wheelMaterial = new CANNON.Material("wheelMaterial");
    // const wheelGroundContactMaterial = new CANNON.ContactMaterial(
    //     concreteMaterial,
    //     wheelMaterial,
    //     {
    //         friction: 0.3,
    //         restitution: 0,
    //         contactEquationStiffness: 1000,
    //     },
    // );
    // world.addContactMaterial(wheelGroundContactMaterial);
}


const parkingZoneMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
});

function createParkingZone(scene, sizeX, sizeZ, posX, posZ) {
    const parkingZoneGeometry = new THREE.PlaneGeometry(sizeX, sizeZ);
    const parkingZoneMesh = new THREE.Mesh(parkingZoneGeometry, parkingZoneMaterial);
    parkingZoneMesh.position.set(posX, 0.01, posZ);
    parkingZoneMesh.rotation.x = -Math.PI / 2;
    scene.add(parkingZoneMesh);
    return parkingZoneMesh;
}


const wallPanelMaterial = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.8, metalness: 0.1 });
const wallColumnMaterial = new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.9, metalness: 0.1 });

function createBoundaryWall(x, z, length, isXAligned, scene, world) {
    const wallHeight = 1;
    const wallThickness = 0.2;

    const position = new THREE.Vector3(x, wallHeight / 2, z);
    const rotationY = isXAligned ? 0 : Math.PI / 2;
    const size = new THREE.Vector3(length, wallHeight, wallThickness);
    const wallGroup = new THREE.Group();
    scene.add(wallGroup);
    wallGroup.position.copy(position);
    wallGroup.rotation.y = rotationY;

    const unitWidth = 2;
    const numUnits = Math.floor(length / unitWidth);
    const columnWidth = 0.25;
    const panelWidth = unitWidth - columnWidth;

    const baseColumnGeo = new THREE.BoxGeometry(columnWidth, size.y, size.z * 1.1);
    const basePanelGeo = new THREE.BoxGeometry(panelWidth, size.y * 0.95, size.z * 0.9);
    const columnGeos = [];
    const panelGeos = [];

    for (let i = 0; i < numUnits; i++) {
        const unitOffset = -length / 2 + i * unitWidth;
        const colGeo = baseColumnGeo.clone();
        colGeo.translate(unitOffset + columnWidth / 2, 0, 0);
        columnGeos.push(colGeo);

        const panGeo = basePanelGeo.clone();
        panGeo.translate(unitOffset + columnWidth + panelWidth / 2, 0, 0);
        panelGeos.push(panGeo);
    }
    const lastColGeo = baseColumnGeo.clone();
    lastColGeo.translate(length / 2 - columnWidth / 2, 0, 0);
    columnGeos.push(lastColGeo);

    const mergedColumns = BufferGeometryUtils.mergeGeometries(columnGeos);
    const mergedPanels = BufferGeometryUtils.mergeGeometries(panelGeos);
    baseColumnGeo.dispose();
    basePanelGeo.dispose();
    columnGeos.forEach(g => g.dispose());
    panelGeos.forEach(g => g.dispose());

    const columnsMesh = new THREE.Mesh(mergedColumns, wallColumnMaterial);
    columnsMesh.receiveShadow = true;
    wallGroup.add(columnsMesh);

    const panelsMesh = new THREE.Mesh(mergedPanels, wallPanelMaterial);
    panelsMesh.receiveShadow = true;
    wallGroup.add(panelsMesh);

    const wallShape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const wallBody = new CANNON.Body({ mass: 0 });
    wallBody.addShape(wallShape);
    wallBody.position.copy(position);
    wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationY);
    world.addBody(wallBody);
    return wallBody;
}


function createDistantCity(scene) {
    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9, metalness: 0.1 });
    const count = 200;
    const baseBox = new THREE.BoxGeometry(1, 1, 1);
    const instancedCity = new THREE.InstancedMesh(baseBox, buildingMaterial, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
        const height = Math.random() * 40 + 10;
        const width = Math.random() * 8 + 4;
        const depth = Math.random() * 8 + 4;
        const angle = Math.random() * Math.PI * 2;
        const radius = 70 + Math.random() * 50;

        dummy.position.set(
            Math.cos(angle) * radius,
            height / 2,
            Math.sin(angle) * radius
        );
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(width, height, depth);
        dummy.updateMatrix();
        instancedCity.setMatrixAt(i, dummy.matrix);
    }
    instancedCity.instanceMatrix.needsUpdate = true;
    scene.add(instancedCity);
}


function createWarehouse(x, z, rotationY, scene, world) {
    const warehouseGroup = new THREE.Group();
    scene.add(warehouseGroup);
    warehouseGroup.position.set(x, 0, z);
    warehouseGroup.rotation.y = rotationY;

    const mainBuildingMaterial = new THREE.MeshStandardMaterial({ color: 0xddeeff, roughness: 0.8 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.9 });
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
    const officeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.8 });

    const mainWidth = 25, mainHeight = 6, mainDepth = 10;
    const mainBuildingGeo = new THREE.BoxGeometry(mainWidth, mainHeight, mainDepth);
    const mainBuildingMesh = new THREE.Mesh(mainBuildingGeo, mainBuildingMaterial);
    mainBuildingMesh.position.y = mainHeight / 2;
    mainBuildingMesh.castShadow = true;
    mainBuildingMesh.receiveShadow = true;
    warehouseGroup.add(mainBuildingMesh);

    const roofGeo = new THREE.BoxGeometry(mainWidth * 1.05, 0.4, mainDepth * 1.1);
    const roofMesh = new THREE.Mesh(roofGeo, roofMaterial);
    roofMesh.position.y = mainHeight + 0.2;
    roofMesh.castShadow = true;
    warehouseGroup.add(roofMesh);

    const doorGeo = new THREE.BoxGeometry(5, 3.5, 0.1);
    for (let i = 0; i < 3; i++) {
        const doorMesh = new THREE.Mesh(doorGeo, doorMaterial);
        const xPos = -7 + i * 7;
        const yPos = -1.75;
        const zPos = mainDepth / 2 + 0.01;
        doorMesh.position.set(xPos, yPos, zPos);
        mainBuildingMesh.add(doorMesh);
    }

    const officeWidth = 6, officeHeight = 3, officeDepth = 5;
    const officeGeo = new THREE.BoxGeometry(officeWidth, officeHeight, officeDepth);
    const officeMesh = new THREE.Mesh(officeGeo, officeMaterial);
    officeMesh.position.set(mainWidth / 2 + officeWidth / 2, officeHeight / 2, 0);
    officeMesh.castShadow = true;
    officeMesh.receiveShadow = true;
    warehouseGroup.add(officeMesh);

    const mainShape = new CANNON.Box(new CANNON.Vec3(mainWidth / 2, mainHeight / 2, mainDepth / 2));
    const officeShape = new CANNON.Box(new CANNON.Vec3(officeWidth / 2, officeHeight / 2, officeDepth / 2));
    const warehouseBody = new CANNON.Body({ mass: 0 });
    warehouseBody.addShape(mainShape, new CANNON.Vec3(0, mainHeight / 2, 0));
    warehouseBody.addShape(officeShape, new CANNON.Vec3(mainWidth / 2 + officeWidth / 2, officeHeight / 2, 0));

    warehouseBody.position.copy(warehouseGroup.position);
    warehouseBody.quaternion.copy(warehouseGroup.quaternion);
    world.addBody(warehouseBody);
    return warehouseBody;
}


function createConeVisual(coneHeight, coneRadius) {
    if (cachedConeTemplate) {
        return cachedConeTemplate.clone();
    }

    const coneGroup = new THREE.Group();

    const orangeMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.3, metalness: 0.1 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });

    const baseSize = coneRadius * 2 + 0.10;
    const baseHeight = 0.02;
    const baseGeometry = new THREE.BoxGeometry(baseSize, baseHeight, baseSize);
    baseGeometry.translate(0, baseHeight / 2, 0);

    const orangeGeos = [baseGeometry];
    const whiteGeos = [];

    const totalConeHeight = coneHeight;
    const numSegments = 5; // 3 laranjas, 2 brancas
    const segmentHeight = totalConeHeight / numSegments;
    const coneBottomRadius = coneRadius;
    const coneTopRadius = 0.03;

    const lerp = (a, b, t) => a + (b - a) * t;

    for (let i = 0; i < numSegments; i++) {
        const segmentBottomRadius = lerp(coneBottomRadius, coneTopRadius, i / numSegments);
        const segmentTopRadius = lerp(coneBottomRadius, coneTopRadius, (i + 1) / numSegments);

        const segmentGeometry = new THREE.CylinderGeometry(segmentTopRadius, segmentBottomRadius, segmentHeight, 16);
        segmentGeometry.translate(0, baseHeight + (i * segmentHeight) + (segmentHeight / 2), 0);

        if (i % 2 !== 0) {
            whiteGeos.push(segmentGeometry);
        } else {
            orangeGeos.push(segmentGeometry);
        }
    }

    const mergedOrange = BufferGeometryUtils.mergeGeometries(orangeGeos);
    const mergedWhite = BufferGeometryUtils.mergeGeometries(whiteGeos);
    orangeGeos.forEach(g => g.dispose());
    whiteGeos.forEach(g => g.dispose());

    const orangeMesh = new THREE.Mesh(mergedOrange, orangeMaterial);
    orangeMesh.castShadow = true;
    orangeMesh.receiveShadow = true;
    coneGroup.add(orangeMesh);

    const whiteMesh = new THREE.Mesh(mergedWhite, whiteMaterial);
    whiteMesh.castShadow = true;
    whiteMesh.receiveShadow = true;
    coneGroup.add(whiteMesh);

    cachedConeTemplate = coneGroup;
    return coneGroup.clone();
}


function createProceduralEnvironment(renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    // Domo de céu com gradiente realista (zênite azul, horizonte claro e solo cinza-asfalto)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#2b6cb0');
    grad.addColorStop(0.42, '#87ceeb');
    grad.addColorStop(0.49, '#e6f4ff');
    grad.addColorStop(0.51, '#666666');
    grad.addColorStop(1.0, '#3a3a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Sol brilhante para specular highlight no cromo e verniz
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(190, 32, 8, 0, Math.PI * 2);
    ctx.fill();

    const envTexture = new THREE.CanvasTexture(canvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    envTexture.colorSpace = THREE.SRGBColorSpace;

    const skyMesh = new THREE.Mesh(
        new THREE.SphereGeometry(50, 16, 12),
        new THREE.MeshBasicMaterial({ map: envTexture, side: THREE.BackSide })
    );
    envScene.add(skyMesh);

    const renderTarget = pmremGenerator.fromScene(envScene, 0.02);
    skyMesh.geometry.dispose();
    skyMesh.material.dispose();
    envTexture.dispose();
    pmremGenerator.dispose();

    return renderTarget.texture;
}
