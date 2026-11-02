import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Cenário: pátio de um centro de distribuição/transportadora.
 *  - Céu com nuvens, neblina atmosférica e horizonte com árvores e galpões distantes
 *  - Pátio em asfalto gasto (agregado, remendos, trincas, manchas de óleo) com faixas pintadas
 *  - Muro de placas de concreto com alambrado, postes de iluminação, rodovia em frente
 *  - Galpão com fachada de telha metálica ondulada, docas com portas de enrolar, placa e escritório
 *  - Carretas estacionadas e contêineres fora do pátio
 * Todas as texturas são geradas proceduralmente em <canvas> (sem downloads externos).
 * A física (chão, muros, galpão, cones) e todas as posições usadas pelas fases permanecem as mesmas.
 */

let cachedConeTemplate = null;

export class Scenario {
    constructor() {
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.parkingZone = null;
        this.cones = [];
        this.walls = [];
        this.warehouseBody = null;

        this.scene.background = new THREE.Color(FOG_COLOR);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
    }

    Initialize(world) {
        this.world = world;
        // Iluminação e mapa de ambiente mantidos iguais (o visual do caminhão não muda)
        this.scene.environment = createProceduralEnvironment(this.renderer);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        this.scene.fog = new THREE.Fog(FOG_COLOR, 90, 320);
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

        createSky(this.scene);
        createGround(this.scene, world);
        createYardMarkings(this.scene);
        this.addParkingZone(3.5, 8.5, 0, 0);

        const wallLength = 50;
        const longWallLength = 60;
        const yOffset = 15;
        const yPos = -wallLength / 2 + yOffset;
        this.walls.push(createBoundaryWall(0, yOffset, longWallLength, true, this.scene, world, GATE));  // Front (com portão)
        this.walls.push(createBoundaryWall(0, -wallLength + yOffset, longWallLength, true, this.scene, world));  // Back
        this.walls.push(createBoundaryWall(-longWallLength / 2, yPos, wallLength, false, this.scene, world));  // Right
        this.walls.push(createBoundaryWall(longWallLength / 2, yPos, wallLength, false, this.scene, world));  // Left

        createSurroundings(this.scene);
        createEntranceGate(this.scene);
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
            this.parkingZone.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
            });
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


// ============================================================================
// CONSTANTES E UTILITÁRIOS
// ============================================================================

const FOG_COLOR = 0xc9d6df;

// Limites do pátio (muros): x de -30 a 30, z de -35 a 15
const YARD = { minX: -30, maxX: 30, minZ: -35, maxZ: 15 };

// Portão de correr de entrada no muro da frente (z = 15), vão de x = 10 a x = 18.
// É estático e fechado: a colisão do muro continua cobrindo o vão.
const GATE = { start: 10, end: 18, z: 15 };

/** Gerador pseudoaleatório determinístico (o cenário é sempre igual a cada partida). */
function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

/** Ruído por pixel em torno de uma cor base (amp = variação máxima por canal). */
function fillNoise(ctx, w, h, base, amp, rng, speckle = null) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < w * h; i++) {
        let n = (rng() - 0.5) * 2 * amp;
        if (speckle && rng() < speckle.prob) n += (rng() - 0.3) * speckle.amp;
        d[i * 4] = Math.max(0, Math.min(255, base[0] + n));
        d[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + n));
        d[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + n));
        d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
}

function mergeAndDispose(geos) {
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    return merged;
}


// ============================================================================
// TEXTURAS PROCEDURAIS
// ============================================================================

function makeAsphaltTexture(repeat) {
    const rng = makeRng(11);
    return canvasTexture(1024, 1024, (ctx, w, h) => {
        fillNoise(ctx, w, h, [72, 73, 75], 14, rng, { prob: 0.06, amp: 70 });
        // Remendo irregular (contorno orgânico, sem bordas retas que denunciem a repetição)
        for (let i = 0; i < 2; i++) {
            const cx = rng() * w;
            const cy = rng() * h;
            const rr = 70 + rng() * 90;
            ctx.fillStyle = 'rgba(28, 28, 30, 0.09)';
            ctx.beginPath();
            for (let k = 0; k <= 24; k++) {
                const t = (k / 24) * Math.PI * 2;
                const rad = rr * (0.75 + rng() * 0.4);
                const px = cx + Math.cos(t) * rad * 1.4;
                const py = cy + Math.sin(t) * rad;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }
        // Manchas de desgaste (variação de tom em grande escala)
        for (let i = 0; i < 40; i++) {
            const r = 90 + rng() * 220;
            const x = rng() * w;
            const y = rng() * h;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            const dark = rng() < 0.55;
            g.addColorStop(0, dark ? 'rgba(20, 20, 22, 0.07)' : 'rgba(170, 170, 165, 0.05)');
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // Trincas finas (caminhadas aleatórias)
        ctx.strokeStyle = 'rgba(22, 22, 22, 0.55)';
        for (let i = 0; i < 10; i++) {
            let x = rng() * w;
            let y = rng() * h;
            let ang = rng() * Math.PI * 2;
            ctx.lineWidth = 0.8 + rng() * 1.6;
            ctx.beginPath();
            ctx.moveTo(x, y);
            const steps = 20 + Math.floor(rng() * 50);
            for (let s = 0; s < steps; s++) {
                ang += (rng() - 0.5) * 0.9;
                x += Math.cos(ang) * 6;
                y += Math.sin(ang) * 6;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }, { repeat });
}

function makeGrassTexture(repeat) {
    const rng = makeRng(23);
    return canvasTexture(512, 512, (ctx, w, h) => {
        fillNoise(ctx, w, h, [92, 112, 58], 18, rng);
        for (let i = 0; i < 2600; i++) {
            const x = rng() * w;
            const y = rng() * h;
            const l = 3 + rng() * 6;
            const shade = 60 + Math.floor(rng() * 70);
            ctx.strokeStyle = `rgba(${shade - 10}, ${shade + 40}, ${shade - 30}, 0.55)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (rng() - 0.5) * 3, y - l);
            ctx.stroke();
        }
        for (let i = 0; i < 14; i++) {
            const r = 20 + rng() * 60;
            const x = rng() * w;
            const y = rng() * h;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, rng() < 0.5 ? 'rgba(140, 118, 80, 0.45)' : 'rgba(150, 160, 80, 0.3)');
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
    }, { repeat });
}

function makeGravelTexture(repeat) {
    const rng = makeRng(37);
    return canvasTexture(512, 512, (ctx, w, h) => {
        fillNoise(ctx, w, h, [132, 124, 112], 22, rng);
        for (let i = 0; i < 1800; i++) {
            const r = 0.8 + rng() * 2.6;
            const c = 90 + Math.floor(rng() * 110);
            ctx.fillStyle = `rgb(${c}, ${c - 6}, ${c - 14})`;
            ctx.beginPath();
            ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }, { repeat });
}

function makeConcreteTexture(seed = 41, base = [184, 181, 173]) {
    const rng = makeRng(seed);
    return canvasTexture(256, 256, (ctx, w, h) => {
        fillNoise(ctx, w, h, base, 12, rng, { prob: 0.02, amp: -60 });
        // Sujeira escorrida / respingos na parte de baixo
        const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, 'rgba(60, 55, 45, 0)');
        g.addColorStop(1, 'rgba(60, 55, 45, 0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 10; i++) {
            const x = rng() * w;
            ctx.fillStyle = 'rgba(70, 65, 55, 0.12)';
            ctx.fillRect(x, rng() * h * 0.4, 2 + rng() * 5, h);
        }
    });
}

/** Telha metálica ondulada (trapezoidal) com sujeira escorrida; retorna { map, bump }. */
function makeCorrugatedTextures(baseRgb, repeat, seed = 53) {
    const rng = makeRng(seed);
    const ribs = (ctx, w, h, colored) => {
        for (let x = 0; x < w; x++) {
            const t = (x % 32) / 32;
            const s = t < 0.18 ? 1.0 : (t < 0.32 ? 1.0 - (t - 0.18) * 3.2 : (t < 0.82 ? 0.55 : 0.55 + (t - 0.82) * 2.5));
            if (colored) {
                const k = 0.78 + 0.22 * s;
                ctx.fillStyle = `rgb(${Math.round(baseRgb[0] * k)}, ${Math.round(baseRgb[1] * k)}, ${Math.round(baseRgb[2] * k)})`;
            } else {
                const v = Math.round(255 * s);
                ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
            }
            ctx.fillRect(x, 0, 1, h);
        }
    };
    const map = canvasTexture(256, 256, (ctx, w, h) => {
        ribs(ctx, w, h, true);
        for (let i = 0; i < 18; i++) {
            const x = rng() * w;
            const len = h * (0.2 + rng() * 0.6);
            const g = ctx.createLinearGradient(0, h - len, 0, h);
            g.addColorStop(0, 'rgba(90, 80, 65, 0)');
            g.addColorStop(1, 'rgba(90, 80, 65, 0.22)');
            ctx.fillStyle = g;
            ctx.fillRect(x, h - len, 2 + rng() * 6, len);
        }
        const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
        g.addColorStop(0, 'rgba(70, 62, 50, 0)');
        g.addColorStop(1, 'rgba(70, 62, 50, 0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }, { repeat });
    const bump = canvasTexture(256, 8, (ctx, w, h) => ribs(ctx, w, h, false), { repeat, srgb: false });
    return { map, bump };
}

function makeRollupDoorTexture() {
    return canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#c3c7cc';
        ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h - 10; y += 14) {
            ctx.fillStyle = '#d9dce0';
            ctx.fillRect(0, y, w, 3);
            ctx.fillStyle = '#8e939a';
            ctx.fillRect(0, y + 11, w, 3);
        }
        const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
        g.addColorStop(0, 'rgba(60, 55, 50, 0)');
        g.addColorStop(1, 'rgba(60, 55, 50, 0.3)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1b1c1e';
        ctx.fillRect(0, h - 10, w, 10);
        ctx.fillStyle = '#e8b400';
        ctx.fillRect(w * 0.44, h * 0.62, w * 0.12, 8);
    });
}

function makeChainLinkTexture(repeat) {
    return canvasTexture(64, 64, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(200, 205, 210, 1)';
        ctx.lineWidth = 3;
        for (let k = -w; k <= w * 2; k += w / 2) {
            ctx.beginPath();
            ctx.moveTo(k, 0);
            ctx.lineTo(k + h, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(k + h, 0);
            ctx.lineTo(k, h);
            ctx.stroke();
        }
    }, { repeat });
}

function makeSignTexture() {
    return canvasTexture(1024, 224, (ctx, w, h) => {
        const logoW = 230;
        const stripeH = 26;
        const pad = 26;
        ctx.fillStyle = '#f4f5f6';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#c8102e';
        ctx.fillRect(0, h - stripeH, w, stripeH);
        ctx.fillStyle = '#0b3d91';
        ctx.fillRect(0, 0, logoW, h - stripeH);

        // Escreve o texto reduzindo a fonte até caber na largura disponível (sem cortar)
        const fitText = (text, x, y, maxW, startPx, weight = 'bold') => {
            let px = startPx;
            ctx.font = `${weight} ${px}px Arial, sans-serif`;
            while (ctx.measureText(text).width > maxW && px > 10) {
                px -= 2;
                ctx.font = `${weight} ${px}px Arial, sans-serif`;
            }
            ctx.fillText(text, x, y);
        };

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitText('KTR', logoW / 2, (h - stripeH) / 2 + 4, logoW - 30, 110);

        const textX = logoW + pad;
        const textW = w - textX - pad;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0b3d91';
        fitText('KING OF THE ROAD', textX, 76, textW, 92);
        ctx.fillStyle = '#4b5563';
        fitText('LOGÍSTICA & TRANSPORTES', textX + 4, 150, textW - 4, 52);

        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);
    });
}

function makeDockNumberTexture(num) {
    return canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f2c200';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 84px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), w / 2, h / 2 + 6);
    });
}

function makeOfficeFacadeTexture() {
    const rng = makeRng(61);
    return canvasTexture(512, 256, (ctx, w, h) => {
        fillNoise(ctx, w, h, [214, 205, 188], 8, rng);
        const winTop = h * 0.26;
        const winH = h * 0.42;
        for (let i = 0; i < 4; i++) {
            const x = 28 + i * 120;
            const g = ctx.createLinearGradient(x, winTop, x + 90, winTop + winH);
            g.addColorStop(0, '#5d7282');
            g.addColorStop(0.45, '#9fb4c2');
            g.addColorStop(0.5, '#3d4f5c');
            g.addColorStop(1, '#2b3a45');
            ctx.fillStyle = g;
            ctx.fillRect(x, winTop, 90, winH);
            ctx.strokeStyle = '#3a3d42';
            ctx.lineWidth = 6;
            ctx.strokeRect(x, winTop, 90, winH);
            ctx.beginPath();
            ctx.moveTo(x + 45, winTop);
            ctx.lineTo(x + 45, winTop + winH);
            ctx.stroke();
            ctx.fillStyle = '#9b9488';
            ctx.fillRect(x - 6, winTop + winH + 3, 102, 7);
        }
        ctx.fillStyle = 'rgba(90, 80, 65, 0.18)';
        ctx.fillRect(0, h - 22, w, 22);
    });
}

function makeSkyTexture() {
    const rng = makeRng(71);
    return canvasTexture(2048, 1024, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0.0, '#2f6db3');
        g.addColorStop(0.25, '#5b95d0');
        g.addColorStop(0.43, '#a9cbe6');
        g.addColorStop(0.5, '#dfe8ee');
        g.addColorStop(0.52, '#c9d6df');
        g.addColorStop(1.0, '#c9d6df');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // Nuvens cúmulos suaves (aglomerados de elipses com gradiente radial), achatadas perto do horizonte
        for (let c = 0; c < 46; c++) {
            const cy = h * (0.16 + rng() * 0.3);
            const cx = rng() * w;
            const nearHorizon = (cy / h - 0.16) / 0.3;
            const scale = 30 + rng() * 70;
            const flat = 0.35 + 0.25 * (1 - nearHorizon);
            const puffs = 6 + Math.floor(rng() * 10);
            for (let p = 0; p < puffs; p++) {
                const px = cx + (rng() - 0.5) * scale * 3.2;
                const py = cy + (rng() - 0.5) * scale * 0.6;
                const r = scale * (0.5 + rng() * 0.8);
                for (const dx of [-w, 0, w]) {
                    ctx.save();
                    ctx.translate(px + dx, py);
                    ctx.scale(1, flat);
                    const rg = ctx.createRadialGradient(0, -r * 0.2, 0, 0, 0, r);
                    rg.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
                    rg.addColorStop(0.6, 'rgba(240, 244, 248, 0.45)');
                    rg.addColorStop(1, 'rgba(225, 232, 240, 0)');
                    ctx.fillStyle = rg;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }
    });
}

function makeOilStainTexture(seed) {
    const rng = makeRng(seed);
    return canvasTexture(256, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < 12; i++) {
            const r = 20 + rng() * 70;
            const x = w / 2 + (rng() - 0.5) * 100;
            const y = h / 2 + (rng() - 0.5) * 100;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(12, 12, 14, 0.16)');
            g.addColorStop(1, 'rgba(12, 12, 14, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }
    });
}


// ============================================================================
// CÉU, CHÃO E SINALIZAÇÃO HORIZONTAL
// ============================================================================

function createSky(scene) {
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(450, 48, 24),
        new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.position.set(0, 0, -10);
    sky.renderOrder = -1;
    scene.add(sky);
}

function createGround(scene, world) {
    // Gramado/terra ao redor (visual)
    const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        new THREE.MeshStandardMaterial({ map: makeGrassTexture([160, 160]), roughness: 1.0 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.07;
    grass.receiveShadow = true;
    scene.add(grass);

    // Faixa de cascalho entre o muro e o gramado
    // (termina exatamente no acostamento da rodovia, z = 20.5, para não sobrepor o asfalto e evitar z-fighting)
    const gravel = new THREE.Mesh(
        new THREE.PlaneGeometry(76, 62.5),
        new THREE.MeshStandardMaterial({ map: makeGravelTexture([18, 15]), roughness: 1.0 })
    );
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.set(0, -0.045, -10.75);
    gravel.receiveShadow = true;
    scene.add(gravel);

    // Pátio de asfalto (área interna dos muros)
    const yardW = YARD.maxX - YARD.minX;
    const yardD = YARD.maxZ - YARD.minZ;
    const asphalt = new THREE.Mesh(
        new THREE.PlaneGeometry(yardW, yardD),
        new THREE.MeshStandardMaterial({ map: makeAsphaltTexture([yardW / 16, yardD / 16]), roughness: 0.95, metalness: 0.0 })
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set((YARD.minX + YARD.maxX) / 2, 0, (YARD.minZ + YARD.maxZ) / 2);
    asphalt.receiveShadow = true;
    scene.add(asphalt);

    // Rodovia em frente ao pátio
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 9),
        new THREE.MeshStandardMaterial({ map: makeAsphaltTexture([1000 / 10, 1]), color: 0x8a8a8a, roughness: 0.92 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.025, 25);
    road.receiveShadow = true;
    scene.add(road);
    const roadPaint = [];
    const roadWhite = [];
    for (let x = -500; x < 500; x += 9) {
        roadPaint.push(paintStripGeo(x, 25.0, x + 4.5, 25.0, 0.15));  // faixa central única tracejada
    }
    roadWhite.push(paintStripGeo(-500, 20.85, 500, 20.85, 0.18));
    roadWhite.push(paintStripGeo(-500, 29.15, 500, 29.15, 0.18));
    const yellowRoad = new THREE.Mesh(mergeAndDispose(roadPaint), paintMaterial(0xe0b000));
    yellowRoad.position.y = -0.008;
    yellowRoad.receiveShadow = true;
    scene.add(yellowRoad);
    const whiteRoad = new THREE.Mesh(mergeAndDispose(roadWhite), paintMaterial(0xe8e8e2));
    whiteRoad.position.y = -0.008;
    whiteRoad.receiveShadow = true;
    scene.add(whiteRoad);

    const concreteMaterial = new CANNON.Material("concreteMaterial");
    const groundShape = new CANNON.Box(new CANNON.Vec3(50, 0.1, 50));
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        material: concreteMaterial,
    });
    groundBody.position.y = -0.1;
    world.addBody(groundBody);
}

function paintMaterial(color) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.75,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
}

/** Faixa pintada no chão entre (x1,z1) e (x2,z2) com a largura dada (geometria já no plano XZ). */
function paintStripGeo(x1, z1, x2, z2, width) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const geo = new THREE.PlaneGeometry(len, width);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(-Math.atan2(dz, dx));
    geo.translate((x1 + x2) / 2, 0, (z1 + z2) / 2);
    return geo;
}

function createYardMarkings(scene) {
    // Linha amarela de segurança contornando o pátio (desviando do galpão e do escritório)
    const yellow = [];
    const path = [
        [-18.6, 13.6], [28.6, 13.6], [28.6, -33.6], [-28.6, -33.6], [-28.6, -17.4],
        [-21.1, -17.4], [-21.1, -8.6], [-18.6, -8.6], [-18.6, 13.6]
    ];
    for (let i = 0; i < path.length - 1; i++) {
        yellow.push(paintStripGeo(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], 0.16));
    }
    // Zebrado amarelo em frente ao escritório (área de pedestres)
    for (let k = 0; k < 9; k++) {
        const z = -16.8 + k * 0.85;
        yellow.push(paintStripGeo(-22.3, z, -21.4, z + 0.6, 0.18));
    }
    const yellowMesh = new THREE.Mesh(mergeAndDispose(yellow), paintMaterial(0xd9a800));
    yellowMesh.position.y = 0.004;
    yellowMesh.receiveShadow = true;
    scene.add(yellowMesh);

    // Faixas brancas das docas (perpendiculares ao galpão, entre as 3 portas)
    const white = [];
    [-8, -1, 6, 13].forEach((z) => white.push(paintStripGeo(-19.9, z, -8.0, z, 0.15)));
    // Setas de circulação
    const arrow = (x, z, dir) => {
        white.push(paintStripGeo(x - 1.6 * dir, z, x + 0.6 * dir, z, 0.3));
        white.push(paintStripGeo(x + 0.6 * dir, z, x + 0.1 * dir, z + 0.45, 0.22));
        white.push(paintStripGeo(x + 0.6 * dir, z, x + 0.1 * dir, z - 0.45, 0.22));
    };
    arrow(18, -27, -1);
    arrow(-6, -27, -1);
    const whiteMesh = new THREE.Mesh(mergeAndDispose(white), paintMaterial(0xe9e9e4));
    whiteMesh.position.y = 0.004;
    whiteMesh.receiveShadow = true;
    scene.add(whiteMesh);

    // Manchas de óleo/pneu espalhadas pelo pátio
    const rng = makeRng(83);
    const stainMats = [makeOilStainTexture(1), makeOilStainTexture(2), makeOilStainTexture(3)].map((map) =>
        new THREE.MeshStandardMaterial({
            map, transparent: true, depthWrite: false, roughness: 0.6,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        })
    );
    for (let i = 0; i < 18; i++) {
        const s = 1.5 + rng() * 3.5;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), stainMats[i % 3]);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = rng() * Math.PI;
        m.position.set(-17 + rng() * 45, 0.002, -32 + rng() * 44);
        m.receiveShadow = true;
        scene.add(m);
    }
}


const parkingZoneMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd23f,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
});
const parkingBorderMaterial = paintMaterial(0xffcc00);

function createParkingZone(scene, sizeX, sizeZ, posX, posZ) {
    const parkingZoneGeometry = new THREE.PlaneGeometry(sizeX, sizeZ);
    const parkingZoneMesh = new THREE.Mesh(parkingZoneGeometry, parkingZoneMaterial);
    parkingZoneMesh.position.set(posX, 0.01, posZ);
    parkingZoneMesh.rotation.x = -Math.PI / 2;

    // Contorno pintado da vaga (no plano local do retângulo, que está girado -90° em X)
    const hx = sizeX / 2;
    const hz = sizeZ / 2;
    const w = 0.14;
    const borders = [
        [0, hz - w / 2, sizeX, w], [0, -hz + w / 2, sizeX, w],
        [hx - w / 2, 0, w, sizeZ], [-hx + w / 2, 0, w, sizeZ]
    ].map(([x, y, bw, bh]) => {
        const g = new THREE.PlaneGeometry(bw, bh);
        g.translate(x, y, 0.002);
        return g;
    });
    const border = new THREE.Mesh(mergeAndDispose(borders), parkingBorderMaterial);
    parkingZoneMesh.add(border);

    scene.add(parkingZoneMesh);
    return parkingZoneMesh;
}


// ============================================================================
// MURO DE CONCRETO + ALAMBRADO
// ============================================================================

const wallPanelMaterial = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(41), roughness: 0.92, metalness: 0.0 });
const wallColumnMaterial = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(43, [160, 158, 152]), roughness: 0.95, metalness: 0.0 });
const galvanizedMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb4ba, roughness: 0.45, metalness: 0.8 });

function createBoundaryWall(x, z, length, isXAligned, scene, world, gap = null) {
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

    const baseColumnGeo = new THREE.BoxGeometry(columnWidth, size.y * 1.04, size.z * 1.1);
    const basePanelGeo = new THREE.BoxGeometry(panelWidth, size.y * 0.95, size.z * 0.9);
    const columnGeos = [];
    const panelGeos = [];

    // Vão do portão (em coordenadas locais do muro)
    const gapStart = gap ? gap.start - (isXAligned ? x : z) : null;
    const gapEnd = gap ? gap.end - (isXAligned ? x : z) : null;
    const inGap = (a, b) => gap !== null && b > gapStart + 1e-3 && a < gapEnd - 1e-3;

    for (let i = 0; i < numUnits; i++) {
        const unitOffset = -length / 2 + i * unitWidth;
        if (inGap(unitOffset, unitOffset + unitWidth)) continue;
        const colGeo = baseColumnGeo.clone();
        colGeo.translate(unitOffset + columnWidth / 2, size.y * 0.02, 0);
        columnGeos.push(colGeo);

        const panGeo = basePanelGeo.clone();
        panGeo.translate(unitOffset + columnWidth + panelWidth / 2, 0, 0);
        panelGeos.push(panGeo);
    }
    const lastColGeo = baseColumnGeo.clone();
    lastColGeo.translate(length / 2 - columnWidth / 2, size.y * 0.02, 0);
    columnGeos.push(lastColGeo);
    baseColumnGeo.dispose();
    basePanelGeo.dispose();

    const columnsMesh = new THREE.Mesh(mergeAndDispose(columnGeos), wallColumnMaterial);
    columnsMesh.receiveShadow = true;
    columnsMesh.castShadow = true;
    wallGroup.add(columnsMesh);

    const panelsMesh = new THREE.Mesh(mergeAndDispose(panelGeos), wallPanelMaterial);
    panelsMesh.receiveShadow = true;
    panelsMesh.castShadow = true;
    wallGroup.add(panelsMesh);

    // Alambrado sobre o muro (somente visual; a colisão continua sendo o muro de 1 m), interrompido no vão do portão
    const fenceH = 1.9;
    const segments = gap ? [[-length / 2, gapStart], [gapEnd, length / 2]] : [[-length / 2, length / 2]];
    const postGeos = [];
    const postSpacing = 3;
    segments.forEach(([a, b]) => {
        const segLen = b - a;
        if (segLen <= 0.05) return;
        const nPosts = Math.max(1, Math.round(segLen / postSpacing));
        for (let k = 0; k <= nPosts; k++) {
            const p = a + (segLen * k) / nPosts;
            const g = new THREE.CylinderGeometry(0.035, 0.035, fenceH + 0.1, 6);
            g.translate(p, size.y / 2 + (fenceH + 0.1) / 2, 0);
            postGeos.push(g);
        }
        const rail = new THREE.CylinderGeometry(0.025, 0.025, segLen, 6);
        rail.rotateZ(Math.PI / 2);
        rail.translate((a + b) / 2, size.y / 2 + fenceH, 0);
        postGeos.push(rail);

        const meshTex = makeChainLinkTexture([segLen / 0.5, fenceH / 0.5]);
        const fence = new THREE.Mesh(
            new THREE.PlaneGeometry(segLen, fenceH),
            new THREE.MeshStandardMaterial({
                map: meshTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.7, color: 0xd5dade
            })
        );
        fence.position.set((a + b) / 2, size.y / 2 + fenceH / 2, 0);
        fence.castShadow = true;
        wallGroup.add(fence);
    });
    const posts = new THREE.Mesh(mergeAndDispose(postGeos), galvanizedMaterial);
    posts.castShadow = true;
    wallGroup.add(posts);

    const wallShape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const wallBody = new CANNON.Body({ mass: 0 });
    wallBody.addShape(wallShape);
    wallBody.position.copy(position);
    wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationY);
    world.addBody(wallBody);
    return wallBody;
}


// ============================================================================
// PORTÃO DE CORRER DE ENTRADA (ESTÁTICO, FECHADO) + ACESSO E GUARITA
// ============================================================================

function createEntranceGate(scene) {
    const { start, end, z } = GATE;
    const width = end - start;
    const tail = 3.2;                 // contrapeso do portão autoportante (fica fora do vão)
    const zGate = z + 0.38;           // pelo lado de fora do muro (não invade o pátio)
    const yBase = 0.12;
    const leafH = 2.3;
    const group = new THREE.Group();
    scene.add(group);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.45, metalness: 0.65 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.5, metalness: 0.6 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6 });
    const concreteMat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(141, [168, 166, 160]), roughness: 0.95 });

    // Folha: quadro + barras verticais no vão + treliça no contrapeso
    const frameGeos = [];
    const x0 = start;
    const x1 = end + tail;
    const beam = (xa, xb, y, t = 0.1) => {
        const g = new THREE.BoxGeometry(xb - xa, t, t);
        g.translate((xa + xb) / 2, y, zGate);
        frameGeos.push(g);
    };
    beam(x0, x1, yBase + 0.06, 0.14);              // longarina inferior
    beam(x0, end, yBase + leafH, 0.1);             // travessa superior da folha
    beam(x0, end, yBase + leafH * 0.52, 0.06);     // travessa intermediária
    [x0, end].forEach((xx) => {
        const g = new THREE.BoxGeometry(0.1, leafH, 0.1);
        g.translate(xx, yBase + leafH / 2, zGate);
        frameGeos.push(g);
    });
    const diag = (xa, ya, xb, yb, t = 0.07) => {
        const len = Math.hypot(xb - xa, yb - ya);
        const g = new THREE.BoxGeometry(len, t, t);
        g.rotateZ(Math.atan2(yb - ya, xb - xa));
        g.translate((xa + xb) / 2, (ya + yb) / 2, zGate);
        frameGeos.push(g);
    };
    diag(end, yBase + leafH, x1, yBase + 0.5, 0.1);
    for (let k = 0; k < 3; k++) {
        const xa = end + (tail * k) / 3;
        const xb = end + (tail * (k + 1)) / 3;
        const ya = yBase + leafH - (leafH - 0.5) * (k / 3);
        diag(xa, ya, xb, yBase + 0.06);
    }
    const frame = new THREE.Mesh(mergeAndDispose(frameGeos), frameMat);
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    const barGeos = [];
    for (let xx = x0 + 0.13; xx < end - 0.06; xx += 0.13) {
        const g = new THREE.BoxGeometry(0.035, leafH - 0.1, 0.035);
        g.translate(xx, yBase + leafH / 2, zGate);
        barGeos.push(g);
    }
    const bars = new THREE.Mesh(mergeAndDispose(barGeos), barMat);
    bars.castShadow = true;
    group.add(bars);

    // Faixa zebrada na borda de fechamento
    const hazardTex = canvasTexture(64, 256, (ctx, w, h) => {
        ctx.fillStyle = '#f2c200';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#111111';
        for (let y = -w; y < h + w; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y + w * 0.6);
            ctx.lineTo(w, y + w * 0.6 + 20);
            ctx.lineTo(0, y + 20);
            ctx.closePath();
            ctx.fill();
        }
    });
    const hazard = new THREE.Mesh(new THREE.BoxGeometry(0.12, leafH, 0.13), new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6 }));
    hazard.position.set(x0 + 0.06, yBase + leafH / 2, zGate);
    group.add(hazard);

    // Placa de aviso (dos dois lados)
    const signTex = canvasTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#c8102e';
        ctx.fillRect(0, 0, w, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ATENÇÃO', w / 2, 34);
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 40px Arial, sans-serif';
        ctx.fillText('ENTRADA E SAÍDA', w / 2, 110);
        ctx.fillText('DE CAMINHÕES', w / 2, 158);
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.fillStyle = '#374151';
        ctx.fillText('VELOCIDADE MÁX. 10 km/h', w / 2, 212);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
    });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), signMat);
    sign.position.set((start + end) / 2, yBase + 1.45, zGate + 0.05);
    group.add(sign);
    const signBack = sign.clone();
    signBack.rotation.y = Math.PI;
    signBack.position.z = zGate - 0.05;
    group.add(signBack);

    // Colunas do vão (batente e guia) + rolete-guia superior
    const postGeos = [];
    [start - 0.12, end + 0.12].forEach((px) => {
        const g = new THREE.BoxGeometry(0.22, 2.75, 0.22);
        g.translate(px, 1.375, zGate - 0.2);
        postGeos.push(g);
    });
    const fork = new THREE.BoxGeometry(0.3, 0.12, 0.5);
    fork.translate(end + 0.12, yBase + leafH - 0.05, zGate);
    postGeos.push(fork);
    const posts = new THREE.Mesh(mergeAndDispose(postGeos), postMat);
    posts.castShadow = true;
    group.add(posts);

    // Carrinhos de roldanas sobre bases de concreto (sob o contrapeso)
    const baseGeos = [];
    const rollerGeos = [];
    [end + 0.6, end + tail - 0.6].forEach((rx) => {
        const b = new THREE.BoxGeometry(0.7, 0.1, 0.6);
        b.translate(rx, 0.05, zGate);
        baseGeos.push(b);
        [-0.18, 0.18].forEach((dx) => {
            const r = new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12);
            r.rotateX(Math.PI / 2);
            r.translate(rx + dx, yBase, zGate);
            rollerGeos.push(r);
        });
    });
    const bases = new THREE.Mesh(mergeAndDispose(baseGeos), concreteMat);
    bases.receiveShadow = true;
    group.add(bases);
    const rollers = new THREE.Mesh(mergeAndDispose(rollerGeos), galvanizedMaterial);
    group.add(rollers);

    // Acesso asfaltado do portão até a rodovia + faixa de retenção
    const driveLen = 20.55 - z;
    const drive = new THREE.Mesh(
        new THREE.PlaneGeometry(width + 2, driveLen),
        new THREE.MeshStandardMaterial({ map: makeAsphaltTexture([(width + 2) / 12, driveLen / 12]), roughness: 0.95 })
    );
    drive.rotation.x = -Math.PI / 2;
    drive.position.set((start + end) / 2, -0.012, z + driveLen / 2);
    drive.receiveShadow = true;
    scene.add(drive);
    const stop = new THREE.Mesh(paintStripGeo(start, z + 1.6, end, z + 1.6, 0.35), paintMaterial(0xe9e9e4));
    stop.position.y = -0.008;
    scene.add(stop);

    // Guarita ao lado do portão (do lado de fora)
    const boothX = end + tail + 2.6;
    const boothZ = z + 3.0;
    const facade = makeOfficeFacadeTexture();
    facade.repeat.set(0.45, 1);
    facade.needsUpdate = true;
    const boothWall = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 });
    const boothRoof = new THREE.MeshStandardMaterial({ color: 0x2f4f7f, roughness: 0.6, metalness: 0.3 });
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.5, 2.2), [boothWall, boothWall, boothRoof, boothRoof, boothWall, boothWall]);
    booth.position.set(boothX, 1.25, boothZ);
    booth.castShadow = true;
    booth.receiveShadow = true;
    scene.add(booth);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 2.8), boothRoof);
    roof.position.set(boothX, 2.6, boothZ);
    roof.castShadow = true;
    scene.add(roof);
    const boothBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.6), concreteMat);
    boothBase.position.set(boothX, 0.06, boothZ);
    boothBase.receiveShadow = true;
    scene.add(boothBase);
}


// ============================================================================
// ENTORNO: POSTES, CARRETAS, CONTÊINERES, ÁRVORES E GALPÕES DISTANTES
// ============================================================================

function createSurroundings(scene) {
    createLightPoles(scene);
    createParkedTrailers(scene);
    createContainers(scene);
    createTrees(scene);
    createDistantBuildings(scene);
}

function createLightPoles(scene) {
    const poleGeos = [];
    const lampGeos = [];
    const positions = [];
    [-28, -13, 2].forEach((z) => positions.push([31.3, z, -1, 0]));
    [-28, -20].forEach((z) => positions.push([-31.3, z, 1, 0]));
    [-20, -2, 16].forEach((x) => positions.push([x, -36.3, 0, 1]));
    [-12, 6, 22].forEach((x) => positions.push([x, 16.3, 0, -1]));
    positions.forEach(([x, z, dx, dz]) => {
        const pole = new THREE.CylinderGeometry(0.09, 0.14, 9, 8);
        pole.translate(x, 4.5, z);
        poleGeos.push(pole);
        const arm = new THREE.BoxGeometry(Math.abs(dx) * 1.6 + 0.08, 0.08, Math.abs(dz) * 1.6 + 0.08);
        arm.translate(x + dx * 0.8, 8.85, z + dz * 0.8);
        poleGeos.push(arm);
        const head = new THREE.BoxGeometry(Math.abs(dx) * 0.7 + 0.35, 0.14, Math.abs(dz) * 0.7 + 0.35);
        head.translate(x + dx * 1.6, 8.78, z + dz * 1.6);
        poleGeos.push(head);
        const lens = new THREE.BoxGeometry(Math.abs(dx) * 0.55 + 0.25, 0.03, Math.abs(dz) * 0.55 + 0.25);
        lens.translate(x + dx * 1.6, 8.69, z + dz * 1.6);
        lampGeos.push(lens);
    });
    const poles = new THREE.Mesh(mergeAndDispose(poleGeos), new THREE.MeshStandardMaterial({ color: 0x8d949b, roughness: 0.5, metalness: 0.7 }));
    poles.castShadow = true;
    scene.add(poles);
    const lamps = new THREE.Mesh(mergeAndDispose(lampGeos), new THREE.MeshStandardMaterial({ color: 0xf3f0e6, emissive: 0x2a2820, roughness: 0.3 }));
    scene.add(lamps);
}

function buildSemiTrailer(bodyColor, seed) {
    const g = new THREE.Group();
    const { map, bump } = makeCorrugatedTextures(bodyColor, [14, 1], seed);
    map.wrapS = THREE.RepeatWrapping;
    const boxMat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.6, roughness: 0.55, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8, metalness: 0.3 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });

    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 13.6), boxMat);
    box.position.y = 1.25 + 1.4;
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 13.4), dark);
    chassis.position.y = 1.1;
    chassis.castShadow = true;
    g.add(chassis);
    const wheelGeos = [];
    [-4.3, -5.6].forEach((z) => {
        [-1.0, 1.0].forEach((x) => {
            const w = new THREE.CylinderGeometry(0.5, 0.5, 0.55, 16);
            w.rotateZ(Math.PI / 2);
            w.translate(x, 0.5, z);
            wheelGeos.push(w);
        });
    });
    const wheels = new THREE.Mesh(mergeAndDispose(wheelGeos), tire);
    wheels.castShadow = true;
    g.add(wheels);
    // Pés de apoio na frente
    const legGeos = [];
    [-0.8, 0.8].forEach((x) => {
        const l = new THREE.BoxGeometry(0.12, 1.1, 0.12);
        l.translate(x, 0.55, 4.6);
        legGeos.push(l);
    });
    const legs = new THREE.Mesh(mergeAndDispose(legGeos), dark);
    legs.castShadow = true;
    g.add(legs);
    return g;
}

function createParkedTrailers(scene) {
    const colors = [[236, 238, 240], [205, 40, 40], [230, 232, 235], [32, 74, 150], [238, 238, 236]];
    colors.forEach((c, i) => {
        const t = buildSemiTrailer(c, 100 + i);
        t.position.set(-22 + i * 4.2, 0, -46);
        t.rotation.y = (i % 2 === 0 ? 0 : 0.03);
        scene.add(t);
    });
}

function createContainers(scene) {
    const palette = [[180, 60, 40], [40, 90, 150], [70, 120, 70], [200, 150, 40], [120, 120, 125], [160, 50, 60]];
    const rng = makeRng(91);
    const mats = palette.map((c, i) => {
        const { map, bump } = makeCorrugatedTextures(c, [5, 1], 200 + i);
        return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.6, roughness: 0.7, metalness: 0.3 });
    });
    const geo = new THREE.BoxGeometry(2.44, 2.59, 12.19);
    for (let col = 0; col < 4; col++) {
        const levels = 1 + Math.floor(rng() * 3);
        for (let lv = 0; lv < levels; lv++) {
            const m = new THREE.Mesh(geo, mats[Math.floor(rng() * mats.length)]);
            m.position.set(38 + col * 2.6, 1.295 + lv * 2.59, -12 + (rng() - 0.5) * 0.4);
            m.castShadow = true;
            m.receiveShadow = true;
            scene.add(m);
        }
    }
}

/** Sprite de árvore (copa com centenas de tufos de folhas sombreados + tronco), fundo transparente. */
function makeTreeSprite(seed, conifer = false) {
    const rng = makeRng(seed);
    return canvasTexture(256, 512, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        // Tronco e galhos
        ctx.strokeStyle = '#4a3a2a';
        ctx.lineCap = 'round';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(w / 2, h);
        ctx.lineTo(w / 2 + (rng() - 0.5) * 10, h * 0.45);
        ctx.stroke();
        ctx.lineWidth = 4;
        for (let i = 0; i < 6; i++) {
            const y = h * (0.5 + rng() * 0.25);
            ctx.beginPath();
            ctx.moveTo(w / 2, y);
            ctx.lineTo(w / 2 + (rng() - 0.5) * w * 0.6, y - h * (0.08 + rng() * 0.1));
            ctx.stroke();
        }
        // Copa: tufos de folhagem com luz vinda do alto/direita
        const cx = w / 2;
        const cy = conifer ? h * 0.42 : h * 0.36;
        const rx = conifer ? w * 0.3 : w * 0.44;
        const ry = conifer ? h * 0.38 : h * 0.3;
        const n = 900;
        for (let i = 0; i < n; i++) {
            const a = rng() * Math.PI * 2;
            const rr = Math.sqrt(rng());
            let x = cx + Math.cos(a) * rr * rx;
            let y = cy + Math.sin(a) * rr * ry;
            if (conifer) {
                // formato cônico
                const t = (y - (cy - ry)) / (2 * ry);
                x = cx + (x - cx) * Math.max(0.08, t);
            }
            const light = 0.5 * ((x - cx) / rx) - 0.7 * ((y - cy) / ry) + (rng() - 0.5) * 0.6;
            const l = Math.max(0, Math.min(1, 0.45 + light * 0.45));
            const r = Math.round(28 + 50 * l);
            const g = Math.round(52 + 70 * l);
            const b = Math.round(22 + 30 * l);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
            const s = 4 + rng() * 9;
            ctx.beginPath();
            ctx.ellipse(x, y, s, s * (0.6 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function createTrees(scene) {
    const rng = makeRng(97);
    // Dois planos cruzados por árvore (billboard em X), base no chão
    const plane1 = new THREE.PlaneGeometry(1, 2);
    plane1.translate(0, 1, 0);
    const plane2 = plane1.clone();
    plane2.rotateY(Math.PI / 2);
    const crossGeo = mergeAndDispose([plane1, plane2]);

    const variants = [
        new THREE.MeshStandardMaterial({ map: makeTreeSprite(501), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0 }),
        new THREE.MeshStandardMaterial({ map: makeTreeSprite(502), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0 }),
        new THREE.MeshStandardMaterial({ map: makeTreeSprite(503, true), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0 })
    ];
    const perVariant = 160;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    variants.forEach((mat, vi) => {
        const mesh = new THREE.InstancedMesh(crossGeo, mat, perVariant);
        let placed = 0;
        let guard = 0;
        while (placed < perVariant && guard++ < 4000) {
            const ang = rng() * Math.PI * 2;
            const r = 46 + Math.pow(rng(), 0.7) * 160;
            const x = Math.cos(ang) * r;
            const z = -10 + Math.sin(ang) * r;
            if (z > 18 && z < 33) continue;                       // rodovia
            if (x > 34 && x < 52 && z > -22 && z < -2) continue;  // contêineres
            if (x > -26 && x < 0 && z > -56 && z < -36) continue; // carretas
            const hgt = (vi === 2 ? 9 : 7) + rng() * 6;
            dummy.position.set(x, 0, z);
            dummy.rotation.set(0, rng() * Math.PI, 0);
            dummy.scale.set(hgt * (vi === 2 ? 0.45 : 0.6), hgt / 2, hgt * (vi === 2 ? 0.45 : 0.6));
            dummy.updateMatrix();
            mesh.setMatrixAt(placed, dummy.matrix);
            const v = 0.82 + rng() * 0.3;
            color.setRGB(v * (0.95 + rng() * 0.1), v, v * (0.9 + rng() * 0.1));
            mesh.setColorAt(placed, color);
            placed++;
        }
        mesh.count = placed;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
    });
}

function createDistantBuildings(scene) {
    const rng = makeRng(101);
    const specs = [
        [-90, -70, 40, 10, 26], [70, -95, 55, 12, 30], [-120, -40, 30, 9, 50],
        [120, -45, 26, 11, 60], [10, -130, 70, 14, 34], [-60, 75, 45, 9, 22], [80, 70, 36, 10, 28]
    ];
    const ROAD_Z = 25;
    const ROAD_HALF = 4.5;
    specs.forEach(([x, z0, w, h, d], i) => {
        // Garante que nenhum galpão distante (em qualquer rotação) encoste na rodovia
        const radius = Math.hypot(w, d) / 2;
        let z = z0;
        const minGap = radius + ROAD_HALF + 6;
        if (Math.abs(z - ROAD_Z) < minGap) z = z < ROAD_Z ? ROAD_Z - minGap : ROAD_Z + minGap;
        const tones = [[205, 210, 214], [185, 192, 198], [214, 206, 190]];
        const { map, bump } = makeCorrugatedTextures(tones[i % tones.length], [w / 1.2, 1], 300 + i);
        const sideTex = map.clone();
        sideTex.repeat.set(d / 1.2, 1);
        sideTex.needsUpdate = true;
        const front = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.4, roughness: 0.7, metalness: 0.3 });
        const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.7, metalness: 0.3 });
        const roof = new THREE.MeshStandardMaterial({ color: 0x7c848c, roughness: 0.85 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, front, front]);
        b.position.set(x, h / 2, z);
        b.rotation.y = Math.atan2(-x, -z) + (rng() - 0.5) * 0.3;
        scene.add(b);
    });
}


// ============================================================================
// GALPÃO (CENTRO DE DISTRIBUIÇÃO) COM DOCAS E ESCRITÓRIO
// ============================================================================

function createWarehouse(x, z, rotationY, scene, world) {
    const warehouseGroup = new THREE.Group();
    scene.add(warehouseGroup);
    warehouseGroup.position.set(x, 0, z);
    warehouseGroup.rotation.y = rotationY;

    const mainWidth = 25, mainHeight = 6, mainDepth = 10;

    // Fachada em telha metálica ondulada (repetição proporcional a cada face)
    const front = makeCorrugatedTextures([222, 228, 233], [mainWidth / 1.1, 1], 401);
    const sideMap = front.map.clone();
    sideMap.repeat.set(mainDepth / 1.1, 1);
    sideMap.needsUpdate = true;
    const sideBump = front.bump.clone();
    sideBump.repeat.set(mainDepth / 1.1, 1);
    sideBump.needsUpdate = true;
    const frontMat = new THREE.MeshStandardMaterial({ map: front.map, bumpMap: front.bump, bumpScale: 0.8, roughness: 0.55, metalness: 0.45 });
    const sideMat = new THREE.MeshStandardMaterial({ map: sideMap, bumpMap: sideBump, bumpScale: 0.8, roughness: 0.55, metalness: 0.45 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6f7880, roughness: 0.8, metalness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2f4f7f, roughness: 0.5, metalness: 0.4 });
    const concreteMat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(47, [170, 168, 162]), roughness: 0.95 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.9 });

    const main = new THREE.Mesh(
        new THREE.BoxGeometry(mainWidth, mainHeight, mainDepth),
        [sideMat, sideMat, roofMat, roofMat, frontMat, frontMat]
    );
    main.position.y = mainHeight / 2;
    main.castShadow = true;
    main.receiveShadow = true;
    warehouseGroup.add(main);

    // Rodapé de concreto
    const base = new THREE.Mesh(new THREE.BoxGeometry(mainWidth + 0.1, 1.0, mainDepth + 0.1), concreteMat);
    base.position.y = 0.5;
    base.receiveShadow = true;
    warehouseGroup.add(base);

    // Platibanda (acabamento azul no topo) e faixa azul horizontal
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(mainWidth + 0.3, 0.45, mainDepth + 0.3), trimMat);
    parapet.position.y = mainHeight + 0.1;
    parapet.castShadow = true;
    warehouseGroup.add(parapet);
    const band = new THREE.Mesh(new THREE.BoxGeometry(mainWidth + 0.12, 0.18, mainDepth + 0.12), trimMat);
    band.position.y = 4.15;
    warehouseGroup.add(band);

    // Docas: 3 portas de enrolar com moldura, para-choques de borracha, marquise e número
    const doorTex = makeRollupDoorTexture();
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.5, metalness: 0.5 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.4 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.6 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0x6b6040, roughness: 0.3 });
    [-7, 0, 7].forEach((dx, i) => {
        // Moldura vazada (topo + laterais) ao redor da porta; a porta fica 9 cm à frente da parede (4 cm à frente do rodapé) e a moldura
        // se projeta à frente dela (distâncias generosas evitam z-fighting quando a câmera está longe)
        const frameGeos = [];
        [-1.7, 1.7].forEach((fx) => {
            const g = new THREE.BoxGeometry(0.22, 3.85, 0.14);
            g.translate(dx + fx, 1.925, mainDepth / 2 + 0.1);
            frameGeos.push(g);
        });
        const top = new THREE.BoxGeometry(3.62, 0.25, 0.14);
        top.translate(dx, 3.725, mainDepth / 2 + 0.1);
        frameGeos.push(top);
        const frame = new THREE.Mesh(mergeAndDispose(frameGeos), frameMat);
        frame.castShadow = true;
        warehouseGroup.add(frame);
        const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6), doorMat);
        door.position.set(dx, 1.8, mainDepth / 2 + 0.09);
        door.receiveShadow = true;
        warehouseGroup.add(door);
        [-1.95, 1.95].forEach((bx) => {
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.16), darkMat);
            bumper.position.set(dx + bx, 0.95, mainDepth / 2 + 0.22);
            bumper.castShadow = true;
            warehouseGroup.add(bumper);
        });
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 1.1), canopyMat);
        canopy.position.set(dx, 4.7, mainDepth / 2 + 0.55);
        canopy.castShadow = true;
        warehouseGroup.add(canopy);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), lightMat);
        lamp.position.set(dx, 4.63, mainDepth / 2 + 0.75);
        warehouseGroup.add(lamp);
        const plate = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshStandardMaterial({ map: makeDockNumberTexture(i + 1), roughness: 0.6 })
        );
        plate.position.set(dx + 2.3, 3.4, mainDepth / 2 + 0.05);
        warehouseGroup.add(plate);
        // Faixas zebradas nos batentes
        const hazard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.0, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8b400, roughness: 0.6 }));
        hazard.position.set(dx - 1.7, 0.5, mainDepth / 2 + 0.19);
        warehouseGroup.add(hazard);
        const hazard2 = hazard.clone();
        hazard2.position.x = dx + 1.7;
        warehouseGroup.add(hazard2);
    });

    // Placa da empresa
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(7.2, 1.58),
        new THREE.MeshStandardMaterial({ map: makeSignTexture(), roughness: 0.45, metalness: 0.1 })
    );
    sign.position.set(-3.5, 5.15, mainDepth / 2 + 0.06);
    warehouseGroup.add(sign);

    // Calhas/condutores verticais nas quinas
    const pipeGeos = [];
    [-mainWidth / 2 + 0.15, mainWidth / 2 - 0.15].forEach((px) => {
        const g = new THREE.CylinderGeometry(0.07, 0.07, mainHeight, 8);
        g.translate(px, mainHeight / 2, mainDepth / 2 + 0.1);
        pipeGeos.push(g);
    });
    const pipes = new THREE.Mesh(mergeAndDispose(pipeGeos), canopyMat);
    pipes.castShadow = true;
    warehouseGroup.add(pipes);

    // Escritório anexo
    const officeWidth = 6, officeHeight = 3, officeDepth = 5;
    const facade = makeOfficeFacadeTexture();
    const facadeSide = facade.clone();
    facadeSide.repeat.set(officeDepth / officeWidth, 1);
    facadeSide.needsUpdate = true;
    const officeMat = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 });
    const officeSideMat = new THREE.MeshStandardMaterial({ map: facadeSide, roughness: 0.85 });
    const officeRoof = new THREE.MeshStandardMaterial({ color: 0x5f666d, roughness: 0.9 });
    const office = new THREE.Mesh(
        new THREE.BoxGeometry(officeWidth, officeHeight, officeDepth),
        [officeSideMat, officeSideMat, officeRoof, officeRoof, officeMat, officeMat]
    );
    office.position.set(mainWidth / 2 + officeWidth / 2, officeHeight / 2, 0);
    office.castShadow = true;
    office.receiveShadow = true;
    warehouseGroup.add(office);
    const officeCap = new THREE.Mesh(new THREE.BoxGeometry(officeWidth + 0.2, 0.25, officeDepth + 0.2), trimMat);
    officeCap.position.set(mainWidth / 2 + officeWidth / 2, officeHeight + 0.1, 0);
    officeCap.castShadow = true;
    warehouseGroup.add(officeCap);
    const officeDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshStandardMaterial({ color: 0x3b4a57, roughness: 0.3, metalness: 0.5 }));
    officeDoor.position.set(mainWidth / 2 + officeWidth - 0.9, 1.05, officeDepth / 2 + 0.04);
    warehouseGroup.add(officeDoor);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), trimMat);
    awning.position.set(mainWidth / 2 + officeWidth - 0.9, 2.35, officeDepth / 2 + 0.45);
    awning.castShadow = true;
    warehouseGroup.add(awning);

    // Física (inalterada)
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


// ============================================================================
// CONES E MAPA DE AMBIENTE (INALTERADOS)
// ============================================================================

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


/**
 * Mapa de ambiente (reflexos de cromo, verniz e vidros) gerado a partir de um panorama equiretangular
 * coerente com o cenário: céu com nuvens, sol com halo na direção da luz principal, faixa de árvores e
 * galpões no horizonte (transição suave) e chão de grama/asfalto. Gerado uma única vez no carregamento.
 */
function createProceduralEnvironment(renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const rng = makeRng(131);

    const W = 1024;
    const H = 512;
    const horizon = H / 2;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Céu (mesmos tons do domo visível)
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0.0, '#2f6db3');
    sky.addColorStop(0.5, '#5b95d0');
    sky.addColorStop(0.86, '#a9cbe6');
    sky.addColorStop(1.0, '#dfe8ee');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);

    // Nuvens suaves
    for (let c = 0; c < 26; c++) {
        const cy = horizon * (0.3 + rng() * 0.55);
        const cx = rng() * W;
        const scale = 14 + rng() * 34;
        for (let p = 0; p < 7; p++) {
            const px = cx + (rng() - 0.5) * scale * 3;
            const py = cy + (rng() - 0.5) * scale * 0.5;
            const r = scale * (0.5 + rng() * 0.7);
            for (const dx of [-W, 0, W]) {
                const g = ctx.createRadialGradient(px + dx, py, 0, px + dx, py, r);
                g.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
                g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(px + dx - r, py - r, r * 2, r * 2);
            }
        }
    }

    // Chão: muro de concreto/alambrado logo abaixo do horizonte, depois asfalto do pátio (tons neutros,
    // sem verde, que tingia os cromos verticais)
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0.0, '#b4b4ae');
    ground.addColorStop(0.07, '#9a9a96');
    ground.addColorStop(0.2, '#626366');
    ground.addColorStop(1.0, '#3e3f42');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    // Galpões distantes e faixa irregular de árvores logo acima do horizonte
    for (let i = 0; i < 9; i++) {
        const bw = 30 + rng() * 70;
        const bh = 6 + rng() * 10;
        const bx = rng() * W;
        ctx.fillStyle = rng() < 0.5 ? '#9aa4ad' : '#b5b7b2';
        ctx.fillRect(bx, horizon - bh, bw, bh + 2);
    }
    ctx.fillStyle = '#56664f';
    ctx.beginPath();
    ctx.moveTo(0, horizon + 2);
    for (let x = 0; x <= W; x += 6) {
        const hgt = 4 + Math.abs(Math.sin(x * 0.045)) * 4 + rng() * 5;
        ctx.lineTo(x, horizon - hgt);
    }
    ctx.lineTo(W, horizon + 2);
    ctx.closePath();
    ctx.fill();

    // Suaviza a linha do horizonte (evita a faixa dura nos cilindros cromados)
    const haze = ctx.createLinearGradient(0, horizon - 22, 0, horizon + 22);
    haze.addColorStop(0, 'rgba(214, 226, 234, 0)');
    haze.addColorStop(0.5, 'rgba(214, 226, 234, 0.55)');
    haze.addColorStop(1, 'rgba(214, 226, 234, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 22, W, 44);

    // Sol com halo na direção da luz direcional (20, 30, -20)
    const sunDir = new THREE.Vector3(20, 30, -20).normalize();
    const su = Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5;
    const sv = Math.asin(sunDir.y) / Math.PI + 0.5;
    const sx = su * W;
    const sy = (1 - sv) * H;
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
    halo.addColorStop(0, 'rgba(255, 252, 240, 0.9)');
    halo.addColorStop(0.15, 'rgba(255, 248, 228, 0.55)');
    halo.addColorStop(1, 'rgba(255, 245, 220, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fill();

    const envTexture = new THREE.CanvasTexture(canvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    envTexture.colorSpace = THREE.SRGBColorSpace;

    const renderTarget = pmremGenerator.fromEquirectangular(envTexture);
    envTexture.dispose();
    pmremGenerator.dispose();
    return renderTarget.texture;
}
