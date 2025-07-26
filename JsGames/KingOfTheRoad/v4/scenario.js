import * as THREE from 'three';

export class Scenario {
    constructor() {
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.cones = [];
        this.walls = [];
        this.warehouseBody = null;

        this.scene.background = new THREE.Color(0x87ceeb);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);
    }

    Initialize(world) {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        this.scene.fog = new THREE.Fog(0x87CEEB, 60, 120);
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(20, 30, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        this.scene.add(dirLight);

        createGround(this.scene, world);
        createParkingZone(this.scene);
        [
            { x: -1.75, z: -4 },
            { x: 1.75, z: -4 },
            { x: -1.75, z: 4 },
            { x: 0, z: 4.3 },
            { x: 1.75, z: 4 },
        ].forEach((pos) => this.createCone(pos.x, pos.z, world));

        const wallLength = 40;
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

    createCone(x, z, world) {
        const coneHeight = 0.8,
            coneRadius = 0.3;
        const coneMesh = new THREE.Mesh(
            new THREE.ConeGeometry(coneRadius, coneHeight, 16),
            new THREE.MeshStandardMaterial({ color: 0xff4500 }),
        );
        coneMesh.position.set(x, coneHeight / 2, z);
        coneMesh.castShadow = true;
        this.scene.add(coneMesh);

        const coneBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Cylinder(coneRadius, coneRadius, coneHeight, 16),
        });
        const axis = new CANNON.Vec3(1, 0, 0); // Y axis
        const angle = Math.PI / 2;
        coneBody.quaternion.setFromAxisAngle(axis, angle);
        coneBody.position.copy(coneMesh.position);
        world.addBody(coneBody);
        this.cones.push(coneBody);
    }

    SetUpCollisions(vehicle, level_manager) {
        this.cones.forEach((cone) => {
            cone.addEventListener("collide", (event) => {
                if (!level_manager.Ended()) {
                    if (event.body === vehicle.chassisBody) {
                        level_manager.failedLevel("You crashed into a cone.");
                    }
                }
            });
        });

        this.walls.forEach((wall) => {
            wall.addEventListener("collide", (event) => {
                if (!level_manager.Ended()) {
                    if (event.body === vehicle.chassisBody) {
                        level_manager.failedLevel("You crashed into a wall.");
                    }
                }
            });
        });

        this.warehouseBody.addEventListener('collide', (event) => {
            if (event.body === vehicle.chassisBody) {
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


function createParkingZone(scene) {
    const parkingZoneGeometry = new THREE.PlaneGeometry(3.5, 8);
    const parkingZoneMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
    });
    const parkingZoneMesh = new THREE.Mesh(parkingZoneGeometry, parkingZoneMaterial);
    parkingZoneMesh.position.set(0, 0.01, 0);
    parkingZoneMesh.rotation.x = -Math.PI / 2;
    scene.add(parkingZoneMesh);
}


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
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.8, metalness: 0.1 });
    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.9, metalness: 0.1 });
    const unitWidth = 2;
    const numUnits = Math.floor(length / unitWidth);
    const columnWidth = 0.25;
    const panelWidth = unitWidth - columnWidth;
    for (let i = 0; i < numUnits; i++) {
        const unitOffset = -length / 2 + i * unitWidth;
        const columnGeometry = new THREE.BoxGeometry(columnWidth, size.y, size.z * 1.1);
        const columnMesh = new THREE.Mesh(columnGeometry, columnMaterial);
        columnMesh.position.x = unitOffset + columnWidth / 2;
        columnMesh.castShadow = true;
        columnMesh.receiveShadow = true;
        wallGroup.add(columnMesh);
        const panelGeometry = new THREE.BoxGeometry(panelWidth, size.y * 0.95, size.z * 0.9);
        const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
        panelMesh.position.x = unitOffset + columnWidth + panelWidth / 2;
        panelMesh.castShadow = true;
        panelMesh.receiveShadow = true;
        wallGroup.add(panelMesh);
    }
    const lastColumnGeometry = new THREE.BoxGeometry(columnWidth, size.y, size.z * 1.1);
    const lastColumnMesh = new THREE.Mesh(lastColumnGeometry, columnMaterial);
    lastColumnMesh.position.x = length / 2 - columnWidth / 2;
    wallGroup.add(lastColumnMesh);
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
    const cityGroup = new THREE.Group();
    for (let i = 0; i < 200; i++) {
        const height = Math.random() * 40 + 10;
        const width = Math.random() * 8 + 4;
        const depth = Math.random() * 8 + 4;
        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
        const angle = Math.random() * Math.PI * 2;
        const radius = 70 + Math.random() * 50;
        buildingMesh.position.x = Math.cos(angle) * radius;
        buildingMesh.position.z = Math.sin(angle) * radius;
        buildingMesh.position.y = height / 2;
        buildingMesh.rotation.y = Math.random() * Math.PI;
        cityGroup.add(buildingMesh);
    }
    scene.add(cityGroup);
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

    for (let i = 0; i < 3; i++) {
        const doorGeo = new THREE.BoxGeometry(5, 3.5, 0.1);
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