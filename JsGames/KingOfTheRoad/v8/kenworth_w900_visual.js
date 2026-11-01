import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Modelo 3D esculpido do zero de uma autêntica Kenworth W900L 86" Studio AeroCab.
 *
 * Sistema de coordenadas de construção:
 *  - Eixo X: Lateral (+X = Esquerda / Lado do Motorista, -X = Direita / Lado do Passageiro)
 *  - Eixo Y: Altura em relação ao solo (Y = 0.00 é o asfalto; centro das rodas em Y = 0.52;
 *            topo do chassi em Y = 1.00; prato da 5ª roda em Y = 1.26).
 *            Ao final, o grupo raiz recebe offset Y = -0.76 para alinhar com o chassisBody (Cannon.js).
 *  - Eixo Z: Longitudinal (+Z = Frente, -Z = Traseira; eixo dianteiro em Z = +3.21,
 *            eixos de tração em Z = -2.15 e Z = -3.25, 5ª roda em Z = -2.87).
 */
export function KenworthW900Visual(wheelMeshes = [], options = {}) {
    const mats = createW900Materials();
    const masterGroup = new THREE.Group();

    // Todas as partes da cabine (Capô, Núcleo e Sleeper) usam diretamente o eixo Z global da construção
    const zShift = 0.0;

    // ========================================================================
    // 1. GRUPO ESTRUTURA:
    //    - Chassi
    //    - Cabine dividida em 4 partes: Paralamas, Capô, Núcleo, Sleeper
    //    - Rodas/Pneus (criadas em wheel.js)
    // ========================================================================
    const chassisRaw = new THREE.Group();
    chassisRaw.add(buildHeavyDutyChassis(mats));
    chassisRaw.position.y = -0.76;

    const fenderShellRaw = new THREE.Group();
    fenderShellRaw.add(buildSculptedFrontFenders(mats, { ...DEFAULT_FENDER_PARAMS, showAccessories: false }));
    fenderShellRaw.position.y = -0.76;

    const hoodRaw = new THREE.Group();
    hoodRaw.add(buildAuthenticW900Grille(mats));
    hoodRaw.add(buildSculptedW900Hood(mats));
    hoodRaw.position.y = -0.76;

    const structureGroup = new THREE.Group();
    structureGroup.name = 'estrutura';
    const bakedChassis = bakeStaticMeshesByMaterial(chassisRaw);
    const bakedFifthWheel = new THREE.Group();
    const bakedFenderShell = bakeStaticMeshesByMaterial(fenderShellRaw);
    const bakedHood = bakeStaticMeshesByMaterial(hoodRaw);
    const bakedNucleo = new THREE.Group();
    const bakedSleeper = new THREE.Group();

    const rebuildFifthWheel = (
        fwParams = DEFAULT_CABIN_ELEMENTS_PARAMS.quintaRoda
    ) => {
        while (bakedFifthWheel.children.length > 0) {
            const oldChild = bakedFifthWheel.children[0];
            oldChild.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
            });
            bakedFifthWheel.remove(oldChild);
        }
        const rawFifthWheel = new THREE.Group();
        rawFifthWheel.add(buildAuthenticFifthWheel(fwParams, mats));
        rawFifthWheel.position.y = -0.76;
        bakedFifthWheel.add(bakeStaticMeshesByMaterial(rawFifthWheel));
    };

    rebuildFifthWheel();

    const rebuildSleeper = (
        sideVistaParams = DEFAULT_CABIN_ELEMENTS_PARAMS.janelaSuperiorSleeper
    ) => {
        while (bakedSleeper.children.length > 0) {
            const oldChild = bakedSleeper.children[0];
            oldChild.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
            });
            bakedSleeper.remove(oldChild);
        }
        const rawSleeper = new THREE.Group();
        const sleeperGroup = buildSculptedAerodyneSleeper(mats, sideVistaParams);
        sleeperGroup.position.z = zShift;
        rawSleeper.add(sleeperGroup);
        rawSleeper.position.y = -0.76;
        bakedSleeper.add(bakeStaticMeshesByMaterial(rawSleeper));
    };

    rebuildSleeper();

    const rebuildNucleo = (
        windowParams = DEFAULT_CABIN_ELEMENTS_PARAMS.janelaMotorista,
        nucleoParams = DEFAULT_CABIN_ELEMENTS_PARAMS.nucleo
    ) => {
        while (bakedNucleo.children.length > 0) {
            const oldChild = bakedNucleo.children[0];
            oldChild.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
            });
            bakedNucleo.remove(oldChild);
        }
        const rawNucleo = new THREE.Group();
        const dayCab = buildSculptedDayCabAndInterior(mats, windowParams, nucleoParams);
        dayCab.position.z = zShift;
        rawNucleo.add(dayCab);
        rawNucleo.position.y = -0.76;
        bakedNucleo.add(bakeStaticMeshesByMaterial(rawNucleo));
    };

    rebuildNucleo();

    structureGroup.add(bakedChassis);
    structureGroup.add(bakedFifthWheel);
    structureGroup.add(bakedFenderShell);
    structureGroup.add(bakedHood);
    structureGroup.add(bakedNucleo);
    structureGroup.add(bakedSleeper);
    masterGroup.add(structureGroup);

    // ========================================================================
    // 2. GRUPO OUTROS (Todos os demais acessórios e peças externas)
    // ========================================================================
    const othersRaw = new THREE.Group();

    // Para-choque Dianteiro "Texas Square" Cromado + Faróis de Milha + Guias
    othersRaw.add(buildTexasSquareBumper(mats));

    // Lameiros e Setas de Topo dos Para-lamas Dianteiros (os Faróis e suas Carenas ficam em subgrupos ajustáveis)
    othersRaw.add(buildSculptedFrontFenders(mats, DEFAULT_FENDER_PARAMS, true, false));

    // Carenas (Caixas Vermelhas de Suporte) e Faróis Duplos Dianteiros (subgrupos ajustáveis em tempo real)
    const bakedHeadlightPods = new THREE.Group();
    const bakedHeadlights = new THREE.Group();
    const rebuildHeadlights = (
        podParams = DEFAULT_CABIN_ELEMENTS_PARAMS.caixaFarois
    ) => {
        [bakedHeadlightPods, bakedHeadlights].forEach(grp => {
            while (grp.children.length > 0) {
                const oldChild = grp.children[0];
                oldChild.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                });
                grp.remove(oldChild);
            }
        });
        const { podsGroup, lampsGroup } = buildFrontHeadlightsAndPods(mats, DEFAULT_FENDER_PARAMS, podParams);
        podsGroup.position.y = -0.76;
        lampsGroup.position.y = -0.76;
        bakedHeadlightPods.add(bakeStaticMeshesByMaterial(podsGroup));
        bakedHeadlights.add(bakeStaticMeshesByMaterial(lampsGroup));
    };
    rebuildHeadlights();

    // Acessórios externos das portas do Núcleo (maçanetas, barras grab bar, saias inox e limpadores)
    const cabAccessoriesGroup = buildCabExternalAccessories(mats);
    cabAccessoriesGroup.position.z = zShift;
    othersRaw.add(cabAccessoriesGroup);

    // Viseira Solar Inox, 5 Luzes Torpedo de Cabine e 4 Buzinas a Ar no Teto
    const visorGroup = buildRoofVisorHornsAndLights(mats);
    visorGroup.position.z = zShift;
    othersRaw.add(visorGroup);

    // Retrovisores "West Coast", Antenas CB e Suportes
    othersRaw.add(buildAuthenticMirrors(mats, zShift));

    // Filtros de Ar Externos "Vortox" Inox no Cowl com Cotovelos (subgrupo individual ajustável em tempo real)
    const bakedAirCleaners = new THREE.Group();
    const rebuildAirCleaners = (
        filtroParams = DEFAULT_CABIN_ELEMENTS_PARAMS.filtroArEsquerdo,
        shroudParams = DEFAULT_CABIN_ELEMENTS_PARAMS.chapaTuboFiltroAr
    ) => {
        while (bakedAirCleaners.children.length > 0) {
            const oldChild = bakedAirCleaners.children[0];
            oldChild.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
            });
            bakedAirCleaners.remove(oldChild);
        }
        const vortoxRaw = new THREE.Group();
        const vortoxGroup = buildVortoxAirCleaners(mats, filtroParams, shroudParams);
        vortoxGroup.position.z = zShift;
        vortoxRaw.add(vortoxGroup);
        vortoxRaw.position.y = -0.76;
        bakedAirCleaners.add(bakeStaticMeshesByMaterial(vortoxRaw));
    };
    rebuildAirCleaners();

    // Escapamentos Verticais Duplos de 8" (Monster Stacks) com Protetor Térmico e Ponteiras
    const stacksGroup = buildMonsterExhaustStacks(mats);
    stacksGroup.position.z = zShift;
    othersRaw.add(stacksGroup);

    // Caixas de Bateria com Degraus Duplos e Tanques Cilíndricos de Alumínio Polido
    othersRaw.add(buildStepsAndFuelTanks(mats, zShift));

    // Chapa Xadrez do Passadiço (Deck Catwalk) sobre o topo do chassi (subgrupo individual ajustável)
    const catwalkPlateRaw = new THREE.Group();
    catwalkPlateRaw.add(buildCatwalkDeckPlate(mats));
    catwalkPlateRaw.position.y = -0.76;
    const bakedCatwalkPlate = bakeStaticMeshesByMaterial(catwalkPlateRaw);
    bakedCatwalkPlate.name = 'chapaPassadico';

    // Degraus do Passadiço, Meios-Para-lamas Traseiros, Lameiros, Pogo Stick e Mangueiras
    othersRaw.add(buildCatwalkQuarterFendersAndRear(mats, zShift));

    // Faroletes Traseiros referenciados à extremidade traseira do chassi (movem-se junto com o chassi)
    const rearTaillightsRaw = new THREE.Group();
    rearTaillightsRaw.add(buildRearTaillightsAssembly(mats));
    rearTaillightsRaw.position.y = -0.76;
    const bakedRearTaillights = bakeStaticMeshesByMaterial(rearTaillightsRaw);

    othersRaw.position.y = -0.76;

    const othersGroup = bakeStaticMeshesByMaterial(othersRaw);
    othersGroup.name = 'outros';
    othersGroup.add(bakedHeadlightPods);
    othersGroup.add(bakedHeadlights);
    othersGroup.add(bakedCatwalkPlate);
    othersGroup.add(bakedAirCleaners);
    othersGroup.add(bakedRearTaillights);
    masterGroup.add(othersGroup);

    const panelControls = mountStructureVisibilityUI({
        othersGroup,
        bakedFenderShell,
        bakedHood,
        bakedNucleo,
        bakedSleeper,
        bakedChassis,
        wheelMeshes,
        bakedCatwalkPlate,
        bakedRearTaillights,
        rebuildHeadlights,
        rebuildNucleo,
        initialEngineVariant: options.initialEngineVariant,
        onSelectEngineVariant: options.onSelectEngineVariant
    });
    if (panelControls && typeof panelControls.setActiveEngineVariant === 'function') {
        masterGroup.userData.setActiveEngineVariant = panelControls.setActiveEngineVariant;
    }

    // Controle dinâmico de iluminação em ciclo de 3 estados (tecla 'L'):
    //   0 = Apagado -> 1 = Luzes de Posição -> 2 = Faróis -> 0 = Apagado
    // E controle dos faroletes de freio traseiros (acendem fraco nas luzes de posição e forte ao frear)
    let lightingState = 0; // 0: apagado, 1: luzes de posição, 2: faróis
    let brakeLightsOn = false;

    const updateTailLightsMaterial = () => {
        if (!mats.redTailLamp) return;
        if (brakeLightsOn) {
            // Freio acionado: luzes traseiras vermelhas acendem forte
            mats.redTailLamp.color.setHex(0xff4d4d);
            mats.redTailLamp.emissive.setHex(0xff1a00);
            mats.redTailLamp.emissiveIntensity = 2.8;
        } else if (lightingState >= 1) {
            // Luzes de posição / faróis ativos (sem freio): luzes traseiras acendem bem pouquinho
            mats.redTailLamp.color.setHex(0xd42228);
            mats.redTailLamp.emissive.setHex(0xff1a00);
            mats.redTailLamp.emissiveIntensity = 0.45;
        } else {
            // Totalmente apagadas
            mats.redTailLamp.color.setHex(0xa8181e);
            mats.redTailLamp.emissive.setHex(0x000000);
            mats.redTailLamp.emissiveIntensity = 0.0;
        }
    };

    masterGroup.userData.setBrakeLights = (isBraking) => {
        const active = Boolean(isBraking);
        if (active === brakeLightsOn) return;
        brakeLightsOn = active;
        updateTailLightsMaterial();
    };

    // Controle dinâmico das luzes de ré e faróis de trabalho traseiros (acendem quando o caminhão está dando ré)
    let reverseLightsOn = false;
    masterGroup.userData.setReverseLights = (isReversing) => {
        const active = Boolean(isReversing);
        if (active === reverseLightsOn || !mats.clearReverseLamp) return;
        reverseLightsOn = active;
        if (active) {
            mats.clearReverseLamp.color.setHex(0xffffff);
            mats.clearReverseLamp.emissive.setHex(0xfff6e0);
            mats.clearReverseLamp.emissiveIntensity = 2.6;
        } else {
            mats.clearReverseLamp.color.setHex(0xc8d0d8);
            mats.clearReverseLamp.emissive.setHex(0x000000);
            mats.clearReverseLamp.emissiveIntensity = 0.0;
        }
    };

    const setLightingState = (nextState) => {
        const normalized = ((Number(nextState) % 3) + 3) % 3;
        lightingState = normalized;

        // 1. Luzes de posição (verdes): teto do núcleo, saia lateral cromada, faróis externos dos paralamas e lanternas traseiras fracas
        const positionOn = lightingState >= 1;
        if (mats.amberMarkerLens) {
            if (positionOn) {
                mats.amberMarkerLens.color.setHex(0xffd24d);
                mats.amberMarkerLens.emissive.setHex(0xffb700);
                mats.amberMarkerLens.emissiveIntensity = 2.4;
            } else {
                mats.amberMarkerLens.color.setHex(0xd98a18);
                mats.amberMarkerLens.emissive.setHex(0x000000);
                mats.amberMarkerLens.emissiveIntensity = 0.0;
            }
        }
        if (mats.outerHeadlightLens) {
            if (positionOn) {
                mats.outerHeadlightLens.color.setHex(0xffffff);
                mats.outerHeadlightLens.emissive.setHex(0xfff2cc);
                mats.outerHeadlightLens.emissiveIntensity = lightingState === 2 ? 2.8 : 2.4;
            } else {
                mats.outerHeadlightLens.color.setHex(0xeef4fa);
                mats.outerHeadlightLens.emissive.setHex(0x000000);
                mats.outerHeadlightLens.emissiveIntensity = 0.0;
            }
        }

        // 2. Faróis principais e de milha no para-choque (rosa): acendem forte apenas no estado 2 (faróis)
        const highHeadlightsOn = lightingState === 2;
        if (mats.headlightLens) {
            if (highHeadlightsOn) {
                mats.headlightLens.color.setHex(0xffffff);
                mats.headlightLens.emissive.setHex(0xfff6d8);
                mats.headlightLens.emissiveIntensity = 3.6;
            } else {
                mats.headlightLens.color.setHex(0xeef4fa);
                mats.headlightLens.emissive.setHex(0x000000);
                mats.headlightLens.emissiveIntensity = 0.0;
            }
        }

        // 3. Atualiza as duas lanternas vermelhas traseiras (fracas em luzes de posição/faróis, fortes no freio)
        updateTailLightsMaterial();
        return lightingState;
    };

    masterGroup.userData.setLightingState = setLightingState;
    masterGroup.userData.getLightingState = () => lightingState;
    masterGroup.userData.setHeadlights = (stateOrBool) => {
        if (typeof stateOrBool === 'number') {
            return setLightingState(stateOrBool);
        }
        return setLightingState(stateOrBool ? 2 : 0);
    };
    masterGroup.userData.toggleHeadlights = () => {
        return setLightingState((lightingState + 1) % 3);
    };

    return masterGroup;
}

// ============================================================================
// MATERIAIS PBR E TEXTURAS PROCEDURAIS
// ============================================================================

function createW900Materials() {
    const diamondTex = createDiamondPlateTexture();
    const perfTex = createPerforatedTexture();
    const grilleTex = createRadiatorMeshTexture();
    const headlightTex = createHeadlightTexture();
    const amberMarkerTex = createAmberMarkerTexture();
    const redTailTex = createTailLampTexture(true);
    const clearTailTex = createTailLampTexture(false);

    return {
        // Pintura principal Vermelho Kenworth Carmim Metálico com Verniz Automotivo
        paint: new THREE.MeshPhysicalMaterial({
            color: 0x99080c,
            metalness: 0.48,
            roughness: 0.22,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06
        }),
        // Faixa secundária Branco-Pérola Clássica
        creamStripe: new THREE.MeshPhysicalMaterial({
            color: 0xf6f2e6,
            metalness: 0.18,
            roughness: 0.26,
            clearcoat: 0.9,
            clearcoatRoughness: 0.08
        }),
        // Filete Dourado Metálico
        goldStripe: new THREE.MeshStandardMaterial({
            color: 0xd8b23c,
            metalness: 0.82,
            roughness: 0.22
        }),
        // Cromo Espelhado (Para-choque, Grade, Chaminés, Filtros, Viseira, Maçanetas)
        chrome: new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 1.0,
            roughness: 0.04
        }),
        // Alumínio Polido (Tanques de combustível, rodas, suportes)
        polishedAluminum: new THREE.MeshStandardMaterial({
            color: 0xeef2f6,
            metalness: 0.94,
            roughness: 0.14
        }),
        // Chapa Xadrez de Alumínio (Catwalk, degraus)
        diamondPlate: new THREE.MeshStandardMaterial({
            map: diamondTex,
            color: 0xdde2e8,
            metalness: 0.88,
            roughness: 0.28
        }),
        // Protetor Térmico Perfurado das Chaminés (mesmo acabamento cromado espelhado de mats.chrome nas partes lisas + furos escuros foscos)
        heatShield: new THREE.MeshStandardMaterial({
            map: perfTex.colorMap,
            metalnessMap: perfTex.metalnessMap,
            roughnessMap: perfTex.roughnessMap,
            color: 0xffffff,
            metalness: 1.0,
            roughness: 1.0
        }),
        // Tela Interna do Radiador
        radiatorMesh: new THREE.MeshStandardMaterial({
            map: grilleTex,
            color: 0xc0c5ce,
            metalness: 0.8,
            roughness: 0.35
        }),
        // Vidro Automotivo Fumê Translúcido (permite ver o interior da cabine)
        glass: new THREE.MeshPhysicalMaterial({
            color: 0x16222c,
            metalness: 0.1,
            roughness: 0.06,
            transparent: true,
            opacity: 0.54,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04,
            depthWrite: false
        }),
        // Chassi Heavy-Duty Preto Acetinado / Grafite Escuro
        chassis: new THREE.MeshStandardMaterial({
            color: 0x1c1e22,
            metalness: 0.72,
            roughness: 0.42
        }),
        // Feixe de Molas Parabólicas (mesmo material metálico grafite da v6)
        leafSpring: new THREE.MeshStandardMaterial({
            color: 0x404040,
            metalness: 0.8,
            roughness: 0.6
        }),
        // Parafusos do Anel do Diferencial (mesmo tom prateado 0x777777 da v6)
        axleBolt: new THREE.MeshStandardMaterial({
            color: 0x777777,
            metalness: 0.75,
            roughness: 0.35
        }),
        // Borracha Preta Fosca (Guarnições de janela, lameiros, sanfona, pneus, mangueiras)
        rubber: new THREE.MeshStandardMaterial({
            color: 0x121315,
            metalness: 0.05,
            roughness: 0.88
        }),
        // Forro / Cavidade Interna Sombreada da Caixa de Roda (sem reflexo do horizonte/chão e com oclusão escura)
        wheelWellLiner: new THREE.MeshStandardMaterial({
            color: 0x07080a,
            metalness: 0.02,
            roughness: 0.96,
            envMapIntensity: 0.0,
            side: THREE.DoubleSide
        }),
        // Interior da Cabine (Painel, piso, forração)
        interiorDark: new THREE.MeshStandardMaterial({
            color: 0x202226,
            metalness: 0.1,
            roughness: 0.75
        }),
        // Couro Marrom-Café dos Bancos e Volante
        leather: new THREE.MeshStandardMaterial({
            color: 0x3d261a,
            metalness: 0.12,
            roughness: 0.55
        }),
        // Painel de Madeira Nogueira Clássico Kenworth
        woodgrain: new THREE.MeshStandardMaterial({
            color: 0x6e3518,
            metalness: 0.2,
            roughness: 0.3
        }),
        // Faróis Dianteiros Retangulares Externos dos Para-lamas (acendem no estado "Luzes de Posição" e "Faróis")
        outerHeadlightLens: new THREE.MeshPhysicalMaterial({
            map: headlightTex,
            emissiveMap: headlightTex,
            color: 0xeef4fa,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            metalness: 0.18,
            roughness: 0.08,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04
        }),
        // Faróis Dianteiros Retangulares Internos + Faróis de Milha do Para-choque (acendem forte no estado "Faróis")
        headlightLens: new THREE.MeshPhysicalMaterial({
            map: headlightTex,
            emissiveMap: headlightTex,
            color: 0xeef4fa,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            metalness: 0.18,
            roughness: 0.08,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04
        }),
        // Setas no Topo dos Para-Lamas Dianteiros (Apagadas por padrão com textura de lente âmbar prismática/facetada)
        amberLight: new THREE.MeshPhysicalMaterial({
            map: amberMarkerTex,
            color: 0xd98a18,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            metalness: 0.16,
            roughness: 0.14,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        }),
        // Luzes de Posição Âmbar Amarelo-Alaranjado (Teto e Saia Lateral Cromada - Apagadas por padrão com textura de lente facetada; acendem/apagam com a tecla 'l')
        amberMarkerLens: new THREE.MeshPhysicalMaterial({
            map: amberMarkerTex,
            emissiveMap: amberMarkerTex,
            color: 0xd98a18,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            metalness: 0.16,
            roughness: 0.14,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        }),
        redLight: new THREE.MeshStandardMaterial({
            color: 0xee1111,
            emissive: 0xcc0000,
            emissiveIntensity: 1.5,
            roughness: 0.2
        }),
        // Farolete Traseiro de Freio Vermelho (Apagado por padrão, com textura de refletor tripartido facetado; acende ao frear)
        redTailLamp: new THREE.MeshPhysicalMaterial({
            map: redTailTex,
            emissiveMap: redTailTex,
            color: 0xa8181e,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            metalness: 0.18,
            roughness: 0.14,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        }),
        // Farolete Traseiro de Ré e Luzes de Trabalho Traseiras Cristal/Branco (Apagados por padrão; acendem ao dar ré)
        clearReverseLamp: new THREE.MeshPhysicalMaterial({
            map: clearTailTex,
            emissiveMap: clearTailTex,
            color: 0xc8d0d8,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            metalness: 0.35,
            roughness: 0.14,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        }),
        kwRedBadge: new THREE.MeshStandardMaterial({
            color: 0xb8080c,
            metalness: 0.35,
            roughness: 0.25
        }),
        airLineBlue: new THREE.MeshStandardMaterial({ color: 0x0b5cab, roughness: 0.45, metalness: 0.1 }),
        airLineRed: new THREE.MeshStandardMaterial({ color: 0xc4161c, roughness: 0.45, metalness: 0.1 }),
        airLineGreen: new THREE.MeshStandardMaterial({ color: 0x137a36, roughness: 0.45, metalness: 0.1 })
    };
}

/**
 * Gera textura procedural 256x160 para os faróis dianteiros retangulares (Sealed-Beam / Halógenos W900L)
 * com refletor parabólico cromado, estrias prismáticas verticais de vidro (fluted lens) e escudo central do bulbo.
 */
function createHeadlightTexture() {
    const W = 256;
    const H = 160;
    const cx = W * 0.5;
    const cy = H * 0.5;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Base prateada clara de refletor cromado retangular (fiel ao farol cristalino da referência)
    ctx.fillStyle = '#cfd7e0';
    ctx.fillRect(0, 0, W, H);

    // 2. Quatro facetas trapezoidais do refletor parabólico (topo, base, esquerda e direita)
    const inW = 54;
    const inH = 26;

    // Faceta superior (sombreada pelo lábio superior da moldura cromada)
    const topGrad = ctx.createLinearGradient(0, 0, 0, cy - inH * 0.5);
    topGrad.addColorStop(0.00, '#5c6470');
    topGrad.addColorStop(0.38, '#9aa3b0');
    topGrad.addColorStop(1.00, '#e4ebf2');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(cx + inW * 0.5, cy - inH * 0.5);
    ctx.lineTo(cx - inW * 0.5, cy - inH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Faceta inferior (reflexo branco/prata brilhante como na referência)
    const botGrad = ctx.createLinearGradient(0, cy + inH * 0.5, 0, H);
    botGrad.addColorStop(0.00, '#ffffff');
    botGrad.addColorStop(0.65, '#f0f5fa');
    botGrad.addColorStop(1.00, '#aeb7c4');
    ctx.fillStyle = botGrad;
    ctx.beginPath();
    ctx.moveTo(cx - inW * 0.5, cy + inH * 0.5);
    ctx.lineTo(cx + inW * 0.5, cy + inH * 0.5);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Faceta esquerda
    const leftGrad = ctx.createLinearGradient(0, 0, cx - inW * 0.5, 0);
    leftGrad.addColorStop(0.00, '#8d96a4');
    leftGrad.addColorStop(0.35, '#d4dce6');
    leftGrad.addColorStop(1.00, '#f7fafd');
    ctx.fillStyle = leftGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cx - inW * 0.5, cy - inH * 0.5);
    ctx.lineTo(cx - inW * 0.5, cy + inH * 0.5);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Faceta direita
    const rightGrad = ctx.createLinearGradient(cx + inW * 0.5, 0, W, 0);
    rightGrad.addColorStop(0.00, '#ffffff');
    rightGrad.addColorStop(0.65, '#dce4ee');
    rightGrad.addColorStop(1.00, '#8d96a4');
    ctx.fillStyle = rightGrad;
    ctx.beginPath();
    ctx.moveTo(cx + inW * 0.5, cy - inH * 0.5);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H);
    ctx.lineTo(cx + inW * 0.5, cy + inH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Vincos diagonais nítidos das 4 arestas do refletor retangular
    ctx.strokeStyle = 'rgba(70, 78, 90, 0.55)';
    ctx.lineWidth = 2.0;
    [
        [4, 4, cx - inW * 0.5, cy - inH * 0.5],
        [W - 4, 4, cx + inW * 0.5, cy - inH * 0.5],
        [4, H - 4, cx - inW * 0.5, cy + inH * 0.5],
        [W - 4, H - 4, cx + inW * 0.5, cy + inH * 0.5]
    ].forEach(([x0, y0, x1, y1]) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    });

    // 3. Estrias verticais sutis de lente cristalina
    for (let x = 12; x < W - 12; x += 10) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x, H - 6);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(90, 100, 114, 0.14)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x + 5, 6);
        ctx.lineTo(x + 5, H - 6);
        ctx.stroke();
    }

    // 4. Escudo/cápsula retangular cromada horizontal do bulbo no centro do refletor (fiel à imagem)
    const capGrad = ctx.createLinearGradient(0, cy - inH * 0.5, 0, cy + inH * 0.5);
    capGrad.addColorStop(0.00, '#687280');
    capGrad.addColorStop(0.42, '#ffffff');
    capGrad.addColorStop(0.75, '#cfd8e2');
    capGrad.addColorStop(1.00, '#5a6270');
    ctx.fillStyle = capGrad;
    ctx.fillRect(cx - inW * 0.5, cy - inH * 0.5, inW, inH);
    ctx.strokeStyle = 'rgba(55, 62, 72, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cx - inW * 0.5, cy - inH * 0.5, inW, inH);

    // 5. Borda perimetral da lente de vidro
    ctx.strokeStyle = 'rgba(65, 72, 82, 0.65)';
    ctx.lineWidth = 4.0;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

/**
 * Gera textura procedural 256x256 da lente/refletor interno tripartido (3 câmaras parabólicas + anéis Fresnel)
 * para os faroletes traseiros redondos apagados (vermelho de freio ou cristal/prata de ré).
 */
function createTailLampTexture(isRed) {
    const size = 256;
    const cx = size * 0.5;
    const cy = size * 0.5;
    const R = size * 0.47;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Fundo escuro de vedação
    ctx.fillStyle = isRed ? '#220204' : '#181b20';
    ctx.fillRect(0, 0, size, size);

    // 1. Gradiente radial base da parábola refletora interna
    const baseGrad = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
    if (isRed) {
        baseGrad.addColorStop(0.00, '#c81e24');
        baseGrad.addColorStop(0.32, '#8e0e14');
        baseGrad.addColorStop(0.68, '#58060a');
        baseGrad.addColorStop(0.88, '#961218');
        baseGrad.addColorStop(0.96, '#380406');
        baseGrad.addColorStop(1.00, '#1c0203');
    } else {
        baseGrad.addColorStop(0.00, '#dce2ea');
        baseGrad.addColorStop(0.32, '#8d96a2');
        baseGrad.addColorStop(0.68, '#4a505a');
        baseGrad.addColorStop(0.88, '#9ea7b2');
        baseGrad.addColorStop(0.96, '#2d3238');
        baseGrad.addColorStop(1.00, '#16191d');
    }
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // 2. Três câmaras refletoras côncavas (superior-esquerda -150°, superior-direita -30°, inferior +90°)
    const chamberAngles = [-Math.PI * 5 / 6, -Math.PI / 6, Math.PI / 2];
    chamberAngles.forEach((ang) => {
        const lx = cx + Math.cos(ang) * (R * 0.48);
        const ly = cy + Math.sin(ang) * (R * 0.48);
        const lobeR = R * 0.36;

        // Cavidade escura profunda no centro de cada câmara parabólica
        const pocketGrad = ctx.createRadialGradient(
            lx - Math.cos(ang) * 4,
            ly - Math.sin(ang) * 4,
            lobeR * 0.08,
            lx,
            ly,
            lobeR
        );
        if (isRed) {
            pocketGrad.addColorStop(0.00, '#2c0204');
            pocketGrad.addColorStop(0.48, '#64080d');
            pocketGrad.addColorStop(0.82, '#cb1f27');
            pocketGrad.addColorStop(1.00, 'rgba(140, 14, 20, 0)');
        } else {
            pocketGrad.addColorStop(0.00, '#1e2228');
            pocketGrad.addColorStop(0.48, '#525964');
            pocketGrad.addColorStop(0.82, '#cfd6df');
            pocketGrad.addColorStop(1.00, 'rgba(140, 150, 162, 0)');
        }
        ctx.fillStyle = pocketGrad;
        ctx.beginPath();
        ctx.arc(lx, ly, lobeR, 0, Math.PI * 2);
        ctx.fill();

        // Reflexo especular curvo na borda externa de cada câmara
        ctx.save();
        ctx.strokeStyle = isRed ? 'rgba(255, 110, 110, 0.55)' : 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(lx, ly, lobeR * 0.68, ang - 0.85, ang + 0.85);
        ctx.stroke();
        ctx.restore();
    });

    // 3. Estrias radiais facetadas (óptica Fresnel da lente)
    ctx.save();
    ctx.translate(cx, cy);
    const numFacets = 36;
    for (let i = 0; i < numFacets; i++) {
        const a = (i / numFacets) * Math.PI * 2;
        ctx.strokeStyle = (i % 2 === 0)
            ? (isRed ? 'rgba(255, 90, 90, 0.16)' : 'rgba(255, 255, 255, 0.20)')
            : (isRed ? 'rgba(30, 0, 2, 0.22)' : 'rgba(20, 24, 30, 0.24)');
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (R * 0.18), Math.sin(a) * (R * 0.18));
        ctx.lineTo(Math.cos(a) * (R * 0.88), Math.sin(a) * (R * 0.88));
        ctx.stroke();
    }
    ctx.restore();

    // 4. Anéis concêntricos prismáticos da lente
    [0.28, 0.44, 0.60, 0.74, 0.86].forEach((frac, idx) => {
        ctx.strokeStyle = (idx % 2 === 0)
            ? (isRed ? 'rgba(255, 120, 120, 0.28)' : 'rgba(255, 255, 255, 0.34)')
            : (isRed ? 'rgba(40, 2, 4, 0.35)' : 'rgba(30, 35, 42, 0.38)');
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * frac, 0, Math.PI * 2);
        ctx.stroke();
    });

    // 5. Nervuras divisórias em "Y" invertido (-90° topo, +30° inf-dir, +150° inf-esq) separando as 3 câmaras
    const ribAngles = [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6];
    ribAngles.forEach((ang) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);

        // Sombra lateral da nervura
        ctx.strokeStyle = isRed ? 'rgba(35, 2, 4, 0.75)' : 'rgba(28, 32, 38, 0.75)';
        ctx.lineWidth = 9.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(R * 0.14, 0);
        ctx.lineTo(R * 0.86, 0);
        ctx.stroke();

        // Crista iluminada da nervura
        ctx.strokeStyle = isRed ? '#ee4248' : '#eef3f8';
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(R * 0.14, -0.8);
        ctx.lineTo(R * 0.85, -0.8);
        ctx.stroke();
        ctx.restore();
    });

    // 6. Calota central do bulbo (onde as 3 nervuras se encontram)
    const capGrad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, R * 0.19);
    if (isRed) {
        capGrad.addColorStop(0.00, '#ff7a7e');
        capGrad.addColorStop(0.55, '#b8161c');
        capGrad.addColorStop(1.00, '#420407');
    } else {
        capGrad.addColorStop(0.00, '#ffffff');
        capGrad.addColorStop(0.55, '#aeb7c2');
        capGrad.addColorStop(1.00, '#383e46');
    }
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.19, 0, Math.PI * 2);
    ctx.fill();

    // 7. Brilho vítreo superior-esquerdo na cúpula de policarbonato
    const glossGrad = ctx.createLinearGradient(cx - R * 0.5, cy - R * 0.8, cx + R * 0.2, cy + R * 0.1);
    glossGrad.addColorStop(0.00, isRed ? 'rgba(255, 180, 180, 0.32)' : 'rgba(255, 255, 255, 0.42)');
    glossGrad.addColorStop(0.50, 'rgba(255, 255, 255, 0.06)');
    glossGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = glossGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.84, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

/**
 * Gera textura procedural 160x160 para lentes âmbar apagadas (luzes de posição do teto,
 * lanternas ovais da saia cromada e setas sobre os para-lamas) com borda âmbar-escura,
 * estrias prismáticas Fresnel horizontais/radiais e refletor interno sombreado.
 */
function createAmberMarkerTexture() {
    const S = 160;
    const cx = S * 0.5;
    const cy = S * 0.5;
    const R = S * 0.48;

    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');

    // 1. Fundo âmbar dourado/alaranjado nas bordas da lente
    ctx.fillStyle = '#4a2800';
    ctx.fillRect(0, 0, S, S);

    // 2. Cavidade principal da lente de policarbonato amarelo-alaranjada (âmbar vivo)
    const baseGrad = ctx.createRadialGradient(cx, cy, R * 0.06, cx, cy, R * 1.02);
    baseGrad.addColorStop(0.00, '#ffe042');
    baseGrad.addColorStop(0.32, '#ffba18');
    baseGrad.addColorStop(0.68, '#eb8c00');
    baseGrad.addColorStop(0.90, '#a85a00');
    baseGrad.addColorStop(1.00, '#5c2e00');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, S, S);

    // 3. Facetas radiais sutis (prisma interno do refletor âmbar amarelo-alaranjado)
    const numRays = 28;
    for (let i = 0; i < numRays; i++) {
        const a0 = (i / numRays) * Math.PI * 2;
        const a1 = ((i + 0.5) / numRays) * Math.PI * 2;
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 225, 90, 0.20)' : 'rgba(65, 32, 0, 0.24)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R * 0.92, a0, a1);
        ctx.closePath();
        ctx.fill();
    }

    // 4. Frisos ópticos horizontais (Fresnel ribs típicos de lentes de caminhão)
    const ribStep = 9;
    for (let y = 10; y < S - 10; y += ribStep) {
        ctx.fillStyle = 'rgba(255, 230, 105, 0.25)';
        ctx.fillRect(8, y, S - 16, 2.2);
        ctx.fillStyle = 'rgba(70, 35, 0, 0.35)';
        ctx.fillRect(8, y + 2.2, S - 16, 2.4);
    }

    // 5. Anéis concêntricos de difração e cúpula central do bulbo amarelo-alaranjado
    [0.72, 0.50, 0.30].forEach((rf, idx) => {
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(75, 38, 0, 0.42)' : 'rgba(255, 225, 95, 0.36)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * rf, 0, Math.PI * 2);
        ctx.stroke();
    });

    const bulbGrad = ctx.createRadialGradient(cx - R * 0.05, cy - R * 0.05, R * 0.02, cx, cy, R * 0.24);
    bulbGrad.addColorStop(0.00, '#fff078');
    bulbGrad.addColorStop(0.55, '#ffb014');
    bulbGrad.addColorStop(1.00, '#854200');
    ctx.fillStyle = bulbGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.24, 0, Math.PI * 2);
    ctx.fill();

    // 6. Sombra perimetral interna (profundidade do encaixe na moldura cromada)
    ctx.strokeStyle = 'rgba(25, 5, 0, 0.72)';
    ctx.lineWidth = 8;
    ctx.strokeRect(3, 3, S - 6, S - 6);

    // 7. Reflexo especular vítreo superior-esquerdo na lente
    const glossGrad = ctx.createLinearGradient(cx - R * 0.6, cy - R * 0.85, cx + R * 0.2, cy + R * 0.15);
    glossGrad.addColorStop(0.00, 'rgba(255, 220, 160, 0.34)');
    glossGrad.addColorStop(0.50, 'rgba(255, 200, 120, 0.08)');
    glossGrad.addColorStop(1.00, 'rgba(255, 180, 100, 0.0)');
    ctx.fillStyle = glossGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.84, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

function createDiamondPlateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b4bcc6';
    ctx.fillRect(0, 0, 128, 128);

    const drawDiamondLug = (cx, cy, angle) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        // Sombra inferior do relevo em losango
        ctx.fillStyle = '#58606a';
        ctx.beginPath();
        ctx.moveTo(-9, 1);
        ctx.lineTo(0, 4.2);
        ctx.lineTo(9, 1);
        ctx.lineTo(0, -2.2);
        ctx.closePath();
        ctx.fill();
        // Face superior iluminada do relevo em losango
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-9, -0.5);
        ctx.lineTo(0, 2.8);
        ctx.lineTo(9, -0.5);
        ctx.lineTo(0, -3.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    for (let y = 16; y < 128; y += 32) {
        for (let x = 16; x < 128; x += 32) {
            const isEven = (((x + y) / 32) % 2 === 0);
            drawDiamondLug(x, y, isEven ? Math.PI / 4 : -Math.PI / 4);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 12);
    tex.anisotropy = 8;
    return tex;
}

function createPerforatedTexture() {
    const W = 512;
    const H = 1024;

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = W;
    colorCanvas.height = H;
    const cCtx = colorCanvas.getContext('2d');

    const metalCanvas = document.createElement('canvas');
    metalCanvas.width = W;
    metalCanvas.height = H;
    const mCtx = metalCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = W;
    roughCanvas.height = H;
    const rCtx = roughCanvas.getContext('2d');

    // Fundo 100% cromo espelhado idêntico a mats.chrome (color=#ffffff, metalness=1.0, roughness=0.04 -> #0a0a0a)
    cCtx.fillStyle = '#ffffff';
    cCtx.fillRect(0, 0, W, H);
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(0, 0, W, H);
    rCtx.fillStyle = '#0a0a0a';
    rCtx.fillRect(0, 0, W, H);

    // Duas faixas verticais de furos circulares apenas na seção curva frontal (u em [0.150, 0.452]):
    // - Faixa inferior: v em [0.272, 0.518] (15 linhas x 8 colunas)
    // - Faixa superior: v em [0.552, 0.798] (15 linhas x 8 colunas)
    const uMin = 0.150;
    const uMax = 0.452;
    const cols = 8;
    const rows = 15;
    const bands = [
        [0.272, 0.518],
        [0.552, 0.798]
    ];

    // Raio em pixels calibrado para furos perfeitamente redondos no espaço 3D (perímetro ~0.58m x altura 1.73m)
    const rx = 5.8;
    const ry = 3.9;

    for (const [vStart, vEnd] of bands) {
        for (let r = 0; r < rows; r++) {
            const v = vStart + (r / (rows - 1)) * (vEnd - vStart);
            const py = (1.0 - v) * H;
            for (let c = 0; c < cols; c++) {
                const u = uMin + (c / (cols - 1)) * (uMax - uMin);
                const px = u * W;

                // Borda interna sutil do furo estampado na chapa
                cCtx.fillStyle = '#555b64';
                cCtx.beginPath();
                cCtx.ellipse(px, py, rx * 1.14, ry * 1.14, 0, 0, Math.PI * 2);
                cCtx.fill();

                // Furo escuro profundo e fosco
                cCtx.fillStyle = '#101216';
                cCtx.beginPath();
                cCtx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                cCtx.fill();

                mCtx.fillStyle = '#000000';
                mCtx.beginPath();
                mCtx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                mCtx.fill();

                rCtx.fillStyle = '#f2f2f2';
                rCtx.beginPath();
                rCtx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                rCtx.fill();
            }
        }
    }

    const setupTex = (canvas) => {
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 8;
        return tex;
    };

    return {
        colorMap: setupTex(colorCanvas),
        metalnessMap: setupTex(metalCanvas),
        roughnessMap: setupTex(roughCanvas)
    };
}

function createRadiatorMeshTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#404550';
    ctx.lineWidth = 2;
    for (let x = 4; x < 128; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 128);
        ctx.stroke();
    }
    ctx.strokeStyle = '#252830';
    for (let y = 8; y < 128; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 8);
    return tex;
}

// ============================================================================
// UTILITÁRIOS DE MODELAGEM 3D (LOFTING E NORMAIS COM CREASE ANGLE)
// ============================================================================

/**
 * Gera uma malha 3D (BufferGeometry) interpolando uma lista de seções transversais.
 * Cada seção em `sections` é um array de pontos `[x, y, z]` de mesmo tamanho N.
 */
function createLoftedGeometry(sections, closedLoop = false, capStart = false, capEnd = false, creaseAngle = 0.62) {
    const positions = [];
    const uvs = [];
    const numSections = sections.length;
    const numPts = sections[0].length;

    const pushTri = (a, b, c, uvA, uvB, uvC) => {
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    };

    const segLimit = closedLoop ? numPts : numPts - 1;
    for (let i = 0; i < numSections - 1; i++) {
        const s0 = sections[i];
        const s1 = sections[i + 1];
        const v0 = i / (numSections - 1);
        const v1 = (i + 1) / (numSections - 1);

        for (let j = 0; j < segLimit; j++) {
            const jNext = (j + 1) % numPts;
            const p00 = s0[j];
            const p01 = s0[jNext];
            const p10 = s1[j];
            const p11 = s1[jNext];
            const u0 = j / segLimit;
            const u1 = (j + 1) / segLimit;

            pushTri(p00, p01, p11, [u0, v0], [u1, v0], [u1, v1]);
            pushTri(p00, p11, p10, [u0, v0], [u1, v1], [u0, v1]);
        }
    }

    if (capStart && numPts >= 3) {
        const s = sections[0];
        const c = averagePoint(s);
        for (let j = 0; j < segLimit; j++) {
            const jNext = (j + 1) % numPts;
            pushTri(c, s[jNext], s[j], [0.5, 0.5], [1, 0], [0, 0]);
        }
    }

    if (capEnd && numPts >= 3) {
        const s = sections[numSections - 1];
        const c = averagePoint(s);
        for (let j = 0; j < segLimit; j++) {
            const jNext = (j + 1) % numPts;
            pushTri(c, s[j], s[jNext], [0.5, 0.5], [0, 1], [1, 1]);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    computeCreasedNormals(geo, creaseAngle);
    return geo;
}

function averagePoint(pts) {
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < pts.length; i++) {
        sx += pts[i][0];
        sy += pts[i][1];
        sz += pts[i][2];
    }
    const n = pts.length;
    return [sx / n, sy / n, sz / n];
}

/**
 * Calcula normais suavizadas onde o ângulo entre faces adjacentes é menor que `creaseAngle`
 * e mantém vincos vivos onde o ângulo excede `creaseAngle`.
 */
function computeCreasedNormals(geo, creaseAngle = 0.62) {
    const pos = geo.attributes.position.array;
    const vertexCount = pos.length / 3;
    const faceCount = vertexCount / 3;
    const faceNormals = new Float32Array(faceCount * 3);
    const cosThreshold = Math.cos(creaseAngle);

    const vMap = new Map();
    const quant = (v) => Math.round(v * 2000);

    for (let f = 0; f < faceCount; f++) {
        const i0 = f * 9;
        const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2];
        const bx = pos[i0 + 3], by = pos[i0 + 4], bz = pos[i0 + 5];
        const cx = pos[i0 + 6], cy = pos[i0 + 7], cz = pos[i0 + 8];

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;

        faceNormals[f * 3] = nx;
        faceNormals[f * 3 + 1] = ny;
        faceNormals[f * 3 + 2] = nz;

        for (let k = 0; k < 3; k++) {
            const vi = f * 3 + k;
            const px = pos[vi * 3], py = pos[vi * 3 + 1], pz = pos[vi * 3 + 2];
            const key = `${quant(px)},${quant(py)},${quant(pz)}`;
            let list = vMap.get(key);
            if (!list) {
                list = [];
                vMap.set(key, list);
            }
            list.push(f);
        }
    }

    const normals = new Float32Array(pos.length);
    for (let f = 0; f < faceCount; f++) {
        const fnx = faceNormals[f * 3];
        const fny = faceNormals[f * 3 + 1];
        const fnz = faceNormals[f * 3 + 2];

        for (let k = 0; k < 3; k++) {
            const vi = f * 3 + k;
            const px = pos[vi * 3], py = pos[vi * 3 + 1], pz = pos[vi * 3 + 2];
            const key = `${quant(px)},${quant(py)},${quant(pz)}`;
            const adjFaces = vMap.get(key);

            let sx = 0, sy = 0, sz = 0;
            for (let m = 0; m < adjFaces.length; m++) {
                const f2 = adjFaces[m];
                const n2x = faceNormals[f2 * 3];
                const n2y = faceNormals[f2 * 3 + 1];
                const n2z = faceNormals[f2 * 3 + 2];
                if (fnx * n2x + fny * n2y + fnz * n2z >= cosThreshold) {
                    sx += n2x;
                    sy += n2y;
                    sz += n2z;
                }
            }
            const len = Math.hypot(sx, sy, sz) || 1;
            normals[vi * 3] = sx / len;
            normals[vi * 3 + 1] = sy / len;
            normals[vi * 3 + 2] = sz / len;
        }
    }

    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
}

/**
 * Cria uma lanterna lateral oval âmbar realista estilo Kenworth W900:
 * moldura oval cromada abaulada com parafusos nas extremidades + guarnição escura + lente oval âmbar convexa com núcleo luminoso.
 */
function buildOvalMarkerLamp(side, xSurface, yCenter, zCenter, rotY, mats) {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(xSurface, yCenter, zCenter);
    lampGroup.rotation.y = rotY;

    // 1. Moldura oval cromada abaulada (bezel) com abas de fixação nas pontas
    const bezelDomed = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mats.chrome);
    bezelDomed.scale.set(0.0075, 0.023, 0.056);
    lampGroup.add(bezelDomed);

    // Parafusos cromados nas extremidades longitudinais da moldura oval
    const screwGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.005, 8);
    screwGeo.rotateZ(Math.PI / 2);
    [-0.046, 0.046].forEach(dz => {
        const screw = new THREE.Mesh(screwGeo, mats.chrome);
        screw.position.set(side * 0.0045, 0, dz);
        lampGroup.add(screw);
    });

    // 2. Guarnição/anel interno escuro (mats.rubber) contornando a lente âmbar
    const gasket = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mats.rubber);
    gasket.scale.set(0.0088, 0.0172, 0.040);
    gasket.position.x = side * 0.0008;
    lampGroup.add(gasket);

    // 3. Lente oval âmbar convexa com textura de lente facetada apagada (mats.amberMarkerLens, acende com 'l')
    const lensDomeGeo = new THREE.SphereGeometry(1, 20, 14);
    const ldPos = lensDomeGeo.attributes.position;
    const ldUv = lensDomeGeo.attributes.uv;
    for (let vi = 0; vi < ldPos.count; vi++) {
        ldUv.setXY(
            vi,
            THREE.MathUtils.clamp(0.5 + ldPos.getZ(vi) * 0.5, 0, 1),
            THREE.MathUtils.clamp(0.5 + ldPos.getY(vi) * 0.5, 0, 1)
        );
    }
    ldUv.needsUpdate = true;
    const lensDome = new THREE.Mesh(lensDomeGeo, mats.amberMarkerLens || mats.amberLight);
    lensDome.scale.set(0.0108, 0.0145, 0.036);
    lensDome.position.x = side * 0.0018;
    lampGroup.add(lensDome);

    return lampGroup;
}

// ============================================================================
// 1. CHASSI HEAVY-DUTY, DIFERENCIAIS, SUSPENSÃO, CARDÃ E QUINTA RODA
// ============================================================================

const CHASSIS_Y_BOT = 0.56;                          // Base de referência da carroceria/tanques (m)
const CHASSIS_HEIGHT = 0.33;                         // Altura do chassi (m)
const CHASSIS_Y_TOP = CHASSIS_Y_BOT + CHASSIS_HEIGHT; // Base inferior da saia cromada da cabine = 0.89m

const CHASSIS_FRAME_Y_BOT = 0.67;                    // Distância da parte inferior do chassi ao solo = 0.67m
const CHASSIS_FRAME_Y_TOP = CHASSIS_FRAME_Y_BOT + CHASSIS_HEIGHT; // Topo das longarinas do chassi = 1.00m

const CHASSIS_Z_FRONT = 3.850;                       // Extremidade dianteira do chassi (atrás da grade e embutida no para-choque em Z=+3.945m)
const CHASSIS_Z_REAR = -3.955;                       // Extremidade traseira do chassi para totalizar exatamente 7.90m de ponta a ponta (3.945 - (-3.955) = 7.90m)
const CHASSIS_FRAME_LEN = CHASSIS_Z_FRONT - CHASSIS_Z_REAR; // 7.805m
const CHASSIS_FRAME_CENTER_Z = (CHASSIS_Z_FRONT + CHASSIS_Z_REAR) * 0.5; // -0.0525m

const HOOD_Y_BOT = 0.76;                             // Base inferior do capô e da grade tocando o topo do para-choque (Y = 0.76m)
const HOOD_HEIGHT = 1.10;                            // Altura constante do topo do capô acima do topo do chassi (m)
const HOOD_Y_TOP = CHASSIS_Y_TOP + HOOD_HEIGHT;      // Topo do capô = 1.99m (1.10m acima do topo do chassi)
const HOOD_TOTAL_HEIGHT = HOOD_Y_TOP - HOOD_Y_BOT;   // Altura total do capô/grade = 1.99 - 0.76 = 1.23m (desce 0.13m abaixo do topo do chassi até o para-choque)

const NUCLEO_WINDOW_TOP_HEIGHT = 1.58;               // Altura do ponto mais alto das janelas do núcleo acima do topo do chassi (m)
const NUCLEO_ROOF_MIN_HEIGHT = 1.81;                 // Altura do ponto mais baixo do teto do núcleo acima do topo do chassi (m)
const NUCLEO_HEIGHT = 1.98;                          // Altura do ponto mais alto do núcleo acima do topo do chassi (m)
const NUCLEO_Y_TOP = CHASSIS_Y_TOP + NUCLEO_HEIGHT;  // Topo do núcleo no encontro com o sleeper = 2.87m

const SLEEPER_HEIGHT = 2.46;                         // Altura do sleeper acima do topo do chassi (m)
const SLEEPER_Y_TOP = CHASSIS_Y_TOP + SLEEPER_HEIGHT;// Topo do sleeper = 3.35m

function buildHeavyDutyChassis(mats) {
    const group = new THREE.Group();

    const frameLength = CHASSIS_FRAME_LEN;           // 7.805m: Z de -3.955m a +3.850m (com o para-choque em +3.945m, totaliza 7.90m de ponta a ponta)
    const frameCenterZ = CHASSIS_FRAME_CENTER_Z;     // -0.0525m
    const railH = CHASSIS_HEIGHT;                    // 0.33m de altura
    const railY = CHASSIS_FRAME_Y_BOT + railH / 2;   // De Y=0.67m a Y=1.00m (centro em Y=0.835m)
    const railWebW = 0.022;
    const flangeW = 0.095;
    const flangeT = 0.018;
    const railX = 0.38;       // Largura externa do chassi = 0.78m (livre dos pneus internos traseiros em ±0.405m)

    // Longarinas em perfil "C" (alma vertical + abas superior e inferior)
    [-1, 1].forEach(side => {
        const xWeb = side * railX;
        const xFlange = side * (railX - flangeW / 2 + railWebW / 2);

        const web = new THREE.Mesh(new THREE.BoxGeometry(railWebW, railH, frameLength), mats.chassis);
        web.position.set(xWeb, railY, frameCenterZ);
        group.add(web);

        const topFlange = new THREE.Mesh(new THREE.BoxGeometry(flangeW, flangeT, frameLength), mats.chassis);
        topFlange.position.set(xFlange, railY + railH / 2 - flangeT / 2, frameCenterZ);
        group.add(topFlange);

        const botFlange = new THREE.Mesh(new THREE.BoxGeometry(flangeW, flangeT, frameLength), mats.chassis);
        botFlange.position.set(xFlange, railY - railH / 2 + flangeT / 2, frameCenterZ);
        group.add(botFlange);
    });

    // Travessas estruturais (Crossmembers) ao longo do chassi
    const crossZPositions = [CHASSIS_Z_REAR + 0.10, -3.25, -2.70, -2.15, -1.40, -0.40, 0.60, 1.80, 3.21, CHASSIS_Z_FRONT - 0.035];
    const crossGeo = new THREE.BoxGeometry(railX * 2 - 0.03, railH - 0.06, 0.07);
    crossZPositions.forEach(zPos => {
        const cross = new THREE.Mesh(crossGeo, mats.chassis);
        cross.position.set(0, railY, zPos);
        group.add(cross);
    });

    // Eixo Dianteiro Direcional (Z = +3.21) e Eixos Traseiros em Tandem (Z = -2.15 e Z = -3.25)
    // com feixes de molas multi-lâminas e suportes laterais parafusados na face externa da longarina do chassi (|X| = 0.391m)
    const chassiW = 0.78;
    const axleMountY = 0.75; // Coloca o centro dos eixos em Y = 0.75 - 0.25 = 0.50m (alinhado aos cubos das rodas)

    const frontAxle = buildSteerAxleAssembly(chassiW, 2.00, mats);
    frontAxle.position.set(0, axleMountY, 3.21);
    group.add(frontAxle);

    [-2.15, -3.25].forEach(zAxle => {
        const rearAxle = buildDriveAxleAssembly(chassiW, 1.80, mats);
        rearAxle.position.set(0, axleMountY, zAxle);
        group.add(rearAxle);
    });

    // Suportes laterais do tandem traseiro e do eixo dianteiro parafusados na face vertical externa da longarina
    group.add(buildChassisSideSpringBrackets(chassiW, mats));

    return group;
}

let cachedV6SpringGeos = null;

function getV6LeafSpringGeometries() {
    if (cachedV6SpringGeos) return cachedV6SpringGeos;

    // 6 lâminas concêntricas escalonadas (a mais curta embaixo e a mola-mestre mais longa no topo,
    // curvando suavemente para cima até os suportes laterais na face externa do chassi)
    const leafLengths = [1.04, 0.95, 0.80, 0.64, 0.48, 0.32];
    const numLeaves = leafLengths.length;
    const refHalfLen = leafLengths[0] * 0.5; // 0.52m (mesmo raio de curvatura para todas as lâminas)
    const archRise = 0.088;                  // Elevação das pontas em relação ao assento central no eixo
    const leafWidth = 0.068;                 // Largura do feixe (6.8 cm)
    const leafThickness = 0.0135;            // Espessura de cada lâmina
    const leafStep = 0.0150;                 // Passo vertical entre lâminas (com sulco de 1.5mm para leitura visual nítida)
    const baseBottomY = -0.125;              // Base da 6ª lâmina sobre o assento do eixo (Y global = 0.625m)

    const leafGeos = [];

    for (let i = 0; i < numLeaves; i++) {
        const currentLen = leafLengths[i];
        const segsZ = Math.max(12, Math.round(currentLen * 28));
        const leafGeo = new THREE.BoxGeometry(leafWidth, leafThickness, currentLen, 1, 1, segsZ);
        const pos = leafGeo.attributes.position;
        const yCenterAtZero = baseBottomY + (numLeaves - 1 - i + 0.5) * leafStep;

        for (let j = 0; j < pos.count; j++) {
            const z = pos.getZ(j);
            const yArch = archRise * Math.pow(z / refHalfLen, 2);
            pos.setY(j, pos.getY(j) + yCenterAtZero + yArch);
        }
        pos.needsUpdate = true;
        leafGeo.computeVertexNormals();
        leafGeos.push(leafGeo);
    }

    // Olhais cilíndricos nas duas extremidades da mola-mestre superior (em z = ±0.50m)
    const eyeRadius = 0.022;
    const eyeGeo = new THREE.CylinderGeometry(eyeRadius, eyeRadius, leafWidth + 0.004, 14);
    eyeGeo.rotateZ(Math.PI / 2);
    const yTopLeafCenter = baseBottomY + (numLeaves - 0.5) * leafStep;
    [-0.50, 0.50].forEach(zEye => {
        const yEye = yTopLeafCenter + archRise * Math.pow(zEye / refHalfLen, 2) - 0.006;
        const eyeClone = eyeGeo.clone();
        eyeClone.translate(0, yEye, zEye);
        leafGeos.push(eyeClone);
    });
    eyeGeo.dispose();

    const mergedLeavesGeo = BufferGeometryUtils.mergeGeometries(leafGeos);
    leafGeos.forEach(g => g.dispose());

    // Grampos "U" centrais, placa superior, assento sobre o eixo, placa inferior com 4 porcas
    // e 2 braçadeiras de retenção (rebound clips) com parafuso transversal
    const hardwareGeos = [];
    const boltGeos = [];

    const stackTopY = baseBottomY + numLeaves * leafStep; // -0.035m (Y global = 0.715m)

    // 1. Assento/sela de apoio entre o feixe de molas e o tubo do eixo (y de -0.20m a -0.125m)
    const saddlePad = new THREE.BoxGeometry(leafWidth + 0.020, 0.055, 0.165);
    saddlePad.translate(0, baseBottomY - 0.026, 0);
    hardwareGeos.push(saddlePad);

    // Placa superior dos grampos sobre a mola-mestre
    const topClampPlate = new THREE.BoxGeometry(leafWidth + 0.022, 0.014, 0.155);
    topClampPlate.translate(0, stackTopY + 0.007, 0);
    hardwareGeos.push(topClampPlate);

    // Placa inferior dos grampos abaixo do tubo do eixo (y = -0.355m, Y global = 0.395m)
    const botClampPlateY = -0.355;
    const botClampPlate = new THREE.BoxGeometry(leafWidth + 0.034, 0.018, 0.165);
    botClampPlate.translate(0, botClampPlateY, 0);
    hardwareGeos.push(botClampPlate);

    // 2 Grampos "U" (4 hastes cilíndricas verticais + 2 travessas superiores + 4 porcas inferiores)
    const uRodX = leafWidth * 0.5 + 0.009;
    const uRodZPositions = [-0.058, 0.058];
    const uRodTopY = stackTopY + 0.018;
    const uRodBotY = botClampPlateY - 0.022;
    const uRodLen = uRodTopY - uRodBotY;
    const uRodBaseGeo = new THREE.CylinderGeometry(0.0075, 0.0075, uRodLen, 10);
    const uTopBarBaseGeo = new THREE.CylinderGeometry(0.008, 0.008, uRodX * 2 + 0.012, 10);
    uTopBarBaseGeo.rotateZ(Math.PI / 2);
    const uNutBaseGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.016, 6);

    uRodZPositions.forEach(zPos => {
        const topBar = uTopBarBaseGeo.clone();
        topBar.translate(0, uRodTopY, zPos);
        hardwareGeos.push(topBar);

        [-uRodX, uRodX].forEach(xPos => {
            const rod = uRodBaseGeo.clone();
            rod.translate(xPos, (uRodTopY + uRodBotY) * 0.5, zPos);
            hardwareGeos.push(rod);

            const nut = uNutBaseGeo.clone();
            nut.translate(xPos, botClampPlateY - 0.014, zPos);
            boltGeos.push(nut);
        });
    });
    uRodBaseGeo.dispose();
    uTopBarBaseGeo.dispose();
    uNutBaseGeo.dispose();

    // 2 Braçadeiras Laterais (Rebound Clips) em z = ±0.32m envolvendo as 4 lâminas superiores
    // com parafuso e espaçador cilíndrico inferior (exatamente como nas imagens de referência)
    const clipHalfW = leafWidth * 0.5 + 0.006;
    const clipThick = 0.007;
    const clipWidthZ = 0.028;
    const clipLeavesCount = 4;
    const clipBoxH = clipLeavesCount * leafStep + 0.022;

    [-0.32, 0.32].forEach(zClip => {
        const yArchAtClip = archRise * Math.pow(zClip / refHalfLen, 2);
        const slope = (2 * archRise * zClip) / Math.pow(refHalfLen, 2);
        const tiltAngle = -Math.atan(slope);
        const yClipTop = stackTopY + yArchAtClip + 0.005;
        const yClipCenter = yClipTop - clipBoxH * 0.5;
        const yClipBotBolt = yClipTop - clipBoxH + 0.006;

        // Chapas laterais esquerda e direita da braçadeira
        [-clipHalfW, clipHalfW].forEach(xSide => {
            const sideStrap = new THREE.BoxGeometry(clipThick, clipBoxH, clipWidthZ);
            sideStrap.rotateX(tiltAngle);
            sideStrap.translate(xSide, yClipCenter, zClip);
            hardwareGeos.push(sideStrap);
        });

        // Travessa superior da braçadeira
        const topStrap = new THREE.BoxGeometry(clipHalfW * 2 + clipThick, clipThick, clipWidthZ);
        topStrap.rotateX(tiltAngle);
        topStrap.translate(0, yClipTop, zClip);
        hardwareGeos.push(topStrap);

        // Parafuso transversal + espaçador cilíndrico + cabeças sextavadas sob a 4ª lâmina
        const clipBoltSpacer = new THREE.CylinderGeometry(0.0065, 0.0065, clipHalfW * 2 + 0.024, 10);
        clipBoltSpacer.rotateZ(Math.PI / 2);
        clipBoltSpacer.translate(0, yClipBotBolt, zClip);
        boltGeos.push(clipBoltSpacer);

        [-(clipHalfW + 0.010), clipHalfW + 0.010].forEach(xHead => {
            const head = new THREE.CylinderGeometry(0.0105, 0.0105, 0.009, 6);
            head.rotateZ(Math.PI / 2);
            head.translate(xHead, yClipBotBolt, zClip);
            boltGeos.push(head);
        });
    });

    const mergedUBoltsGeo = BufferGeometryUtils.mergeGeometries(hardwareGeos);
    const mergedSpringBoltsGeo = BufferGeometryUtils.mergeGeometries(boltGeos);
    hardwareGeos.forEach(g => g.dispose());
    boltGeos.forEach(g => g.dispose());

    cachedV6SpringGeos = { mergedLeavesGeo, mergedUBoltsGeo, mergedSpringBoltsGeo };
    return cachedV6SpringGeos;
}

function createV6RearSpring(mats) {
    const { mergedLeavesGeo, mergedUBoltsGeo, mergedSpringBoltsGeo } = getV6LeafSpringGeometries();
    const springGroup = new THREE.Group();
    springGroup.add(new THREE.Mesh(mergedLeavesGeo.clone(), mats.leafSpring || mats.chassis));
    springGroup.add(new THREE.Mesh(mergedUBoltsGeo.clone(), mats.chassis));
    springGroup.add(new THREE.Mesh(mergedSpringBoltsGeo.clone(), mats.axleBolt || mats.polishedAluminum));
    return springGroup;
}

function buildChassisSideSpringBrackets(chassiW, mats) {
    const group = new THREE.Group();
    const xChassisOuter = chassiW * 0.5 + 0.001; // Face vertical externa da alma da longarina (|X| = 0.391m)
    const springX = xChassisOuter + 0.051;       // Centro do feixe de molas (|X| = 0.442m, fora do chassi)
    const springHalfW = 0.034;                   // Meia largura da mola (0.068m / 2)

    const bracketGeos = [];
    const boltGeos = [];

    const addHexBoltX = (xFace, y, z, side, radius = 0.013, depth = 0.012) => {
        const washer = new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, 0.004, 12);
        washer.rotateZ(Math.PI / 2);
        washer.translate(xFace + side * 0.002, y, z);
        boltGeos.push(washer);

        const head = new THREE.CylinderGeometry(radius, radius, depth, 6);
        head.rotateZ(Math.PI / 2);
        head.translate(xFace + side * (0.004 + depth * 0.5), y, z);
        boltGeos.push(head);
    };

    // Suporte tipo Clevis Lateral (usado nas extremidades dianteira e traseira do feixe na face externa do chassi)
    const addEndHangerBracket = (side, zCenter, openTowardZSign) => {
        const xFlangeCenter = side * (xChassisOuter + 0.007);
        const xInnerWall = side * (springX - springHalfW - 0.007); // ~0.401m
        const xOuterWall = side * (springX + springHalfW + 0.008); // ~0.484m
        const xBoxSpan = Math.abs(xOuterWall - xInnerWall) + 0.012;
        const xBoxCenter = side * ((Math.abs(xInnerWall) + Math.abs(xOuterWall)) * 0.5);

        // 1. Chapa de base (flange retangular) parafusada na face vertical externa da longarina
        const flangeW = 0.014;
        const flangeH = 0.215;
        const flangeZ = 0.210;
        const flangeY = 0.805;
        const flangeGeo = new THREE.BoxGeometry(flangeW, flangeH, flangeZ);
        flangeGeo.translate(xFlangeCenter, flangeY, zCenter);
        bracketGeos.push(flangeGeo);

        // 4 Parafusos sextavados nos cantos da chapa de base
        const xFlangeOuterFace = side * (xChassisOuter + flangeW);
        [-0.076, 0.076].forEach(dz => {
            [0.735, 0.875].forEach(by => {
                addHexBoltX(xFlangeOuterFace, by, zCenter + dz, side, 0.0115, 0.010);
            });
        });

        // 2. Capuz superior e paredes laterais (interna e externa) que abraçam a ponta do feixe de molas
        const boxZ = 0.132;
        const yTop = 0.895;
        const yBot = 0.640;
        const boxH = yTop - yBot;
        const wallT = 0.012;

        // Teto do suporte saindo da longarina
        const roofGeo = new THREE.BoxGeometry(xBoxSpan, 0.016, boxZ);
        roofGeo.translate(xBoxCenter, yTop - 0.008, zCenter);
        bracketGeos.push(roofGeo);

        // Parede de fundo (oposta ao lado por onde a mola entra)
        const backWallZ = zCenter - openTowardZSign * (boxZ * 0.5 - wallT * 0.5);
        const backWallGeo = new THREE.BoxGeometry(xBoxSpan, boxH, wallT);
        backWallGeo.translate(xBoxCenter, (yTop + yBot) * 0.5, backWallZ);
        bracketGeos.push(backWallGeo);

        // Paredes laterais interna e externa do clevis
        [xInnerWall, xOuterWall].forEach(xWall => {
            const cheekGeo = new THREE.BoxGeometry(wallT, boxH, boxZ);
            cheekGeo.translate(xWall, (yTop + yBot) * 0.5, zCenter);
            bracketGeos.push(cheekGeo);
        });

        // Parafuso pivô central grande na face externa do suporte (onde prende o olhal da mola)
        const xOuterFace = side * (Math.abs(xOuterWall) + wallT * 0.5);
        addHexBoltX(xOuterFace, 0.720, zCenter, side, 0.018, 0.016);
    };

    // Suporte Central Alto do Balancim do Tandem (em Z = -2.70m, entre os dois eixos traseiros)
    const addCenterTandemEqualizerBracket = (side, zCenter) => {
        const flangeW = 0.014;
        const xFlangeCenter = side * (xChassisOuter + flangeW * 0.5);
        const xFlangeOuterFace = side * (xChassisOuter + flangeW);

        // 1. Chapa de base larga parafusada na face externa da longarina (Y = 0.70m..0.955m, Z = -2.825m..-2.575m)
        const flangeH = 0.255;
        const flangeZ = 0.250;
        const flangeY = 0.828;
        const flangeGeo = new THREE.BoxGeometry(flangeW, flangeH, flangeZ);
        flangeGeo.translate(xFlangeCenter, flangeY, zCenter);
        bracketGeos.push(flangeGeo);

        // 4 Parafusos sextavados nos cantos da chapa de base
        [-0.095, 0.095].forEach(dz => {
            [0.735, 0.920].forEach(by => {
                addHexBoltX(xFlangeOuterFace, by, zCenter + dz, side, 0.012, 0.010);
            });
        });

        // 2. Coluna central vertical alta (Y = 0.555m a Y = 0.930m) projetando-se para fora do chassi
        const xInnerWall = side * (springX - springHalfW - 0.007);
        const xOuterWall = side * (springX + springHalfW + 0.008);
        const wallT = 0.012;
        const xBoxSpan = Math.abs(xOuterWall - xInnerWall) + wallT;
        const xBoxCenter = side * ((Math.abs(xInnerWall) + Math.abs(xOuterWall)) * 0.5);

        const colYBot = 0.555;
        const colYTop = 0.930;
        const colH = colYTop - colYBot;
        const colZ = 0.116;

        // Paredes interna, externa e topo da coluna central
        [xInnerWall, xOuterWall].forEach(xWall => {
            const colWall = new THREE.BoxGeometry(wallT, colH, colZ);
            colWall.translate(xWall, (colYTop + colYBot) * 0.5, zCenter);
            bracketGeos.push(colWall);
        });
        const colRoof = new THREE.BoxGeometry(xBoxSpan, 0.016, colZ + 0.010);
        colRoof.translate(xBoxCenter, colYTop - 0.008, zCenter);
        bracketGeos.push(colRoof);
        const colBot = new THREE.BoxGeometry(xBoxSpan, 0.016, colZ);
        colBot.translate(xBoxCenter, colYBot + 0.008, zCenter);
        bracketGeos.push(colBot);

        // Grande parafuso pivô inferior do balancim (em Y = 0.595m na coluna central)
        const xOuterFace = side * (Math.abs(xOuterWall) + wallT * 0.5);
        addHexBoltX(xOuterFace, 0.595, zCenter, side, 0.020, 0.018);

        // 3. Abas laterais em capuz (frente +Z e trás -Z) onde entram as pontas das duas molas traseiras
        const wingZLen = 0.092;
        const wingYBot = 0.720;
        const wingYTop = 0.855;
        const wingH = wingYTop - wingYBot;
        [-1, 1].forEach(zDir => {
            const zWingCenter = zCenter + zDir * (colZ * 0.5 + wingZLen * 0.5 - 0.004);
            const wingRoof = new THREE.BoxGeometry(xBoxSpan, 0.014, wingZLen);
            wingRoof.translate(xBoxCenter, wingYTop - 0.007, zWingCenter);
            bracketGeos.push(wingRoof);

            [xInnerWall, xOuterWall].forEach(xWall => {
                const wingCheek = new THREE.BoxGeometry(wallT, wingH, wingZLen);
                wingCheek.translate(xWall, (wingYTop + wingYBot) * 0.5, zWingCenter);
                bracketGeos.push(wingCheek);
            });

            // Pino/parafuso de retenção de cada ponta de mola dentro da aba
            addHexBoltX(xOuterFace, 0.775, zCenter + zDir * 0.088, side, 0.014, 0.012);
        });
    };

    // Suportes de Batente Superior (Axle Stop Brackets) na face externa da longarina acima de cada eixo traseiro
    const addUpperAxleStopBracket = (side, zAxle) => {
        const flangeW = 0.012;
        const xFlangeCenter = side * (xChassisOuter + flangeW * 0.5);
        const xFlangeOuterFace = side * (xChassisOuter + flangeW);
        const stopH = 0.145;
        const stopZ = 0.115;
        const yBot = 0.765;
        const yTop = yBot + stopH;

        // Chapa vertical na alma da longarina
        const vPlate = new THREE.BoxGeometry(flangeW, stopH, stopZ);
        vPlate.translate(xFlangeCenter, (yBot + yTop) * 0.5, zAxle);
        bracketGeos.push(vPlate);

        // 2 Parafusos sextavados na chapa vertical
        [-0.030, 0.030].forEach(dz => {
            addHexBoltX(xFlangeOuterFace, yBot + stopH * 0.58, zAxle + dz, side, 0.011, 0.009);
        });

        // Base horizontal de batente projetando-se sobre o feixe de molas
        const padSpanX = 0.082;
        const padCenter = side * (xChassisOuter + padSpanX * 0.5);
        const padGeo = new THREE.BoxGeometry(padSpanX, 0.016, stopZ);
        padGeo.translate(padCenter, yBot + 0.008, zAxle);
        bracketGeos.push(padGeo);

        // Nervuras laterais (gussets) unindo a chapa vertical à base horizontal
        [-0.046, 0.046].forEach(dz => {
            const gusset = new THREE.BoxGeometry(padSpanX * 0.85, stopH * 0.72, 0.010);
            gusset.translate(side * (xChassisOuter + padSpanX * 0.42), yBot + stopH * 0.38, zAxle + dz);
            bracketGeos.push(gusset);
        });
    };

    [-1, 1].forEach(side => {
        // Suportes do Tandem Traseiro (Z = -1.67m dianteiro, Z = -2.70m central, Z = -3.73m traseiro)
        addEndHangerBracket(side, -1.67, -1); // Recebe a ponta frontal da mola de Z = -2.15m (vinda de -Z)
        addCenterTandemEqualizerBracket(side, -2.70);
        addEndHangerBracket(side, -3.73, +1); // Recebe a ponta traseira da mola de Z = -3.25m (vinda de +Z)

        // Batentes superiores na longarina acima dos eixos traseiros (Z = -2.15m e Z = -3.25m)
        addUpperAxleStopBracket(side, -2.15);
        addUpperAxleStopBracket(side, -3.25);

        // Suportes laterais do Eixo Dianteiro Direcional (Z = +3.21m -> suportes em +3.69m e +2.73m)
        addEndHangerBracket(side, 3.69, -1);
        addEndHangerBracket(side, 2.73, +1);
    });

    const mergedBrackets = BufferGeometryUtils.mergeGeometries(bracketGeos);
    const mergedBolts = BufferGeometryUtils.mergeGeometries(boltGeos);
    bracketGeos.forEach(g => g.dispose());
    boltGeos.forEach(g => g.dispose());

    group.add(new THREE.Mesh(mergedBrackets, mats.chassis));
    group.add(new THREE.Mesh(mergedBolts, mats.axleBolt || mats.polishedAluminum));
    return group;
}

function buildSteerAxleAssembly(chassiW, axleLength, mats) {
    const group = new THREE.Group();
    // Feixes de mola posicionados fora da alma da longarina (|X| = 0.442m)
    const springX = chassiW * 0.5 + 0.052;

    const springL = createV6RearSpring(mats);
    springL.position.x = springX;
    group.add(springL);

    const springR = createV6RearSpring(mats);
    springR.position.x = -springX;
    group.add(springR);

    const axleRadius = 0.07;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(axleRadius, axleRadius, axleLength, 24), mats.chassis);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = -0.25;
    group.add(axle);

    return group;
}

function buildDriveAxleAssembly(chassiW, axleLength, mats) {
    const group = new THREE.Group();
    // Feixes de mola posicionados fora da alma da longarina (|X| = 0.442m)
    const springX = chassiW * 0.5 + 0.052;

    const springL = createV6RearSpring(mats);
    springL.position.x = springX;
    group.add(springL);

    const springR = createV6RearSpring(mats);
    springR.position.x = -springX;
    group.add(springR);

    // Eixo traseiro com diferencial esférico ("satélite"), anel central e 12 parafusos prateados
    const axleGroup = new THREE.Group();
    axleGroup.position.y = -0.25;

    const sateliteRadius = 0.20;
    const satelite = new THREE.Mesh(new THREE.SphereGeometry(sateliteRadius, 24, 24), mats.chassis);
    axleGroup.add(satelite);

    const axleRadius = 0.10;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(axleRadius, axleRadius, axleLength, 24), mats.chassis);
    axle.rotation.z = Math.PI / 2;
    axleGroup.add(axle);

    const ringRadius = sateliteRadius + 0.03;
    const ringLength = 0.9 * axleRadius * 2;
    const sateliteRing = new THREE.Mesh(new THREE.CylinderGeometry(ringRadius, ringRadius, ringLength, 24), mats.chassis);
    sateliteRing.rotation.x = Math.PI / 2;
    axleGroup.add(sateliteRing);

    // 12 parafusos ao redor do anel do diferencial (mesclados em uma única geometria para performance)
    const boltRadius = 0.01;
    const boltPosRadius = (sateliteRadius + ringRadius) / 2 - boltRadius;
    const numBolts = 12;
    const baseBoltGeometry = new THREE.CylinderGeometry(boltRadius, boltRadius, ringLength + 0.02, 8);
    baseBoltGeometry.rotateX(Math.PI / 2);
    const boltGeos = [];
    for (let i = 0; i < numBolts; i++) {
        const angle = (i / numBolts) * Math.PI * 2;
        const g = baseBoltGeometry.clone();
        g.translate(Math.sin(angle) * boltPosRadius, Math.cos(angle) * boltPosRadius, 0);
        boltGeos.push(g);
    }
    const mergedBolts = BufferGeometryUtils.mergeGeometries(boltGeos);
    baseBoltGeometry.dispose();
    boltGeos.forEach(g => g.dispose());
    axleGroup.add(new THREE.Mesh(mergedBolts, mats.axleBolt || mats.polishedAluminum));

    group.add(axleGroup);
    return group;
}

function buildAuthenticFifthWheel(fwParamsOrZ = DEFAULT_CABIN_ELEMENTS_PARAMS.quintaRoda, matsOrY, maybeMats) {
    let posX = 0.00;
    let posY = CHASSIS_FRAME_Y_TOP;
    let posZ = -2.835;
    let alturaBase = 0.125;
    let mats = matsOrY;

    if (typeof fwParamsOrZ === 'object' && fwParamsOrZ !== null) {
        posX = fwParamsOrZ.posX ?? 0.00;
        posY = fwParamsOrZ.posY ?? CHASSIS_FRAME_Y_TOP;
        posZ = fwParamsOrZ.posZ ?? -2.835;
        alturaBase = fwParamsOrZ.alturaBase ?? 0.125;
        mats = matsOrY;
    } else {
        posZ = fwParamsOrZ;
        posY = matsOrY;
        mats = maybeMats;
    }

    const group = new THREE.Group();
    group.position.set(posX, posY, posZ);

    // ========================================================================
    // 1. PLACA BASE CORRUGADA (MOUNTING SUBFRAME PLATE) E PARAFUSOS DO CHASSI
    //    (Faixa central de 0.16m removida e metades movidas 0.08m para dentro
    //     para que a largura total seja 0.78m, cabendo exatamente no chassi)
    // ========================================================================
    const inwardShiftX = 0.08; // 0.08m de cada lado (reduz a largura de 0.94m para 0.78m)
    const baseW = 0.94 - 2 * inwardShiftX; // 0.78m (alinhada aos limites externos do chassi)
    const baseH = 0.028;
    const baseL = 0.96;
    const sliderBase = new THREE.Mesh(
        new RoundedBoxGeometry(baseW, baseH, baseL, 2, 0.006),
        mats.chassis
    );
    sliderBase.position.set(0, baseH * 0.5, 0.02);
    group.add(sliderBase);

    // Nervuras longitudinais de reforço das duas metades da placa base deslocadas 0.08m para dentro
    [-(0.41 - inwardShiftX), -(0.18 - inwardShiftX), 0.18 - inwardShiftX, 0.41 - inwardShiftX].forEach(xRib => {
        const rib = new THREE.Mesh(
            new RoundedBoxGeometry(0.036, 0.010, baseL - 0.06, 2, 0.003),
            mats.chassis
        );
        rib.position.set(xRib, baseH + 0.003, 0.02);
        group.add(rib);
    });

    // Fileiras laterais de parafusos sextavados prendendo a placa base às longarinas (deslocadas 0.08m para dentro)
    const frameBoltGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 6);
    const frameWasherGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12);
    [-1, 1].forEach(side => {
        for (let zB = -0.36; zB <= 0.40; zB += 0.152) {
            const xB = side * (0.445 - inwardShiftX); // ±0.365m
            const washer = new THREE.Mesh(frameWasherGeo, mats.chassis);
            washer.position.set(xB, baseH + 0.002, zB);
            group.add(washer);

            const bolt = new THREE.Mesh(frameBoltGeo, mats.chassis);
            bolt.position.set(xB, baseH + 0.008, zB);
            group.add(bolt);
        }
    });

    // ========================================================================
    // 2. SAPATAS / PEDESTAIS FUNDIDOS ARQUEADOS COM 4 PARAFUSOS E PINO LATERAL
    //    (Movidos 0.08m para dentro acompanhando as duas metades da placa base)
    // ========================================================================
    const DEFAULT_PEDESTAL_HEIGHT = 0.16;
    const baseScaleY = Math.max(0.05, alturaBase / DEFAULT_PEDESTAL_HEIGHT);
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.set(0, baseH, 0);
    pedestalGroup.scale.set(1, baseScaleY, 1);
    group.add(pedestalGroup);

    const pedBoltGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.026, 6);
    const pedNutGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.014, 6);
    const pedWasherGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.005, 14);

    [-1, 1].forEach(side => {
        const xPed = side * (0.295 - inwardShiftX); // ±0.215m
        const zPed = 0.02;

        // Flange inferior da sapata apoiada sobre a placa base
        const flangeW = 0.19;
        const flangeH = 0.022;
        const flangeL = 0.42;
        const pedFlange = new THREE.Mesh(
            new RoundedBoxGeometry(flangeW, flangeH, flangeL, 2, 0.006),
            mats.chassis
        );
        pedFlange.position.set(xPed, flangeH * 0.5, zPed);
        pedestalGroup.add(pedFlange);

        // 4 Parafusos pesados + porcas sextavadas + arruelas nos 4 cantos da sapata (Imagem 3)
        [-0.068, 0.068].forEach(dx => {
            [-0.165, 0.165].forEach(dz => {
                const bx = xPed + dx;
                const bz = zPed + dz;
                const by = flangeH;

                const washer = new THREE.Mesh(pedWasherGeo, mats.chassis);
                washer.position.set(bx, by + 0.0025, bz);
                pedestalGroup.add(washer);

                const nut = new THREE.Mesh(pedNutGeo, mats.chassis);
                nut.position.set(bx, by + 0.011, bz);
                pedestalGroup.add(nut);

                const stud = new THREE.Mesh(pedBoltGeo, mats.chassis);
                stud.position.set(bx, by + 0.016, bz);
                pedestalGroup.add(stud);
            });
        });

        // Pernas dianteira e traseira inclinadas do pedestal formando o arco central vazado (Imagem 3)
        [-1, 1].forEach(zDir => {
            const leg = new THREE.Mesh(
                new RoundedBoxGeometry(0.115, 0.155, 0.095, 2, 0.008),
                mats.chassis
            );
            leg.position.set(xPed, 0.092, zPed + zDir * 0.105);
            leg.rotation.x = -zDir * 0.32;
            pedestalGroup.add(leg);
        });

        // Bloco superior do mancal do pedestal (onde o prato articula)
        const trunnionHead = new THREE.Mesh(
            new RoundedBoxGeometry(0.130, 0.056, 0.21, 2, 0.010),
            mats.chassis
        );
        trunnionHead.position.set(xPed, 0.136, zPed);
        pedestalGroup.add(trunnionHead);

        // Nervura lateral arqueada ligando as duas pernas da sapata
        const archBridge = new THREE.Mesh(
            new RoundedBoxGeometry(0.085, 0.048, 0.28, 2, 0.006),
            mats.chassis
        );
        archBridge.position.set(xPed, 0.062, zPed);
        pedestalGroup.add(archBridge);
    });

    // ========================================================================
    // 3. PRATO PRINCIPAL FUNDIDO DA QUINTA RODA (JOST CAST TOP PLATE)
    //    Com face superior horizontal (paralela ao chassi), rampa dupla nas
    //    orelhas traseiras, saia perimetral espessa, garganta em "V", garra
    //    interna, canais de graxa e 2x3 furos laterais
    // ========================================================================
    const plateGroup = new THREE.Group();
    plateGroup.position.set(0, baseH + alturaBase + 0.067, 0);
    plateGroup.rotation.x = 0.0; // Face superior na posição horizontal (paralela ao chassi)
    group.add(plateGroup);

    // Função de deflexão vertical da rampa traseira:
    // Plana na metade frontal/central (z >= -0.14m) e inclina mais para baixo nas duas orelhas traseiras
    // (exatamente como o vinco transversal das orelhas nas Imagens 1, 2 e 3)
    const getRampDropY = (z) => {
        const zCrease = -0.145;
        if (z >= zCrease) return 0.0;
        const u = THREE.MathUtils.clamp((zCrease - z) / (0.455 - 0.145), 0, 1);
        return -0.052 * Math.pow(u, 1.12);
    };

    // Altura da saia perimetral fundida (mais profunda no meio junto ao pino do pedestal,
    // afilando nas pontas traseiras das orelhas, fiel à Imagem 3)
    const getSkirtDepth = (z) => {
        if (z >= 0) {
            return THREE.MathUtils.lerp(0.068, 0.052, THREE.MathUtils.clamp(z / 0.34, 0, 1));
        }
        return THREE.MathUtils.lerp(0.068, 0.028, THREE.MathUtils.clamp(-z / 0.455, 0, 1));
    };

    // Construímos o prato fundido em duas metades simétricas (esquerda +X e direita -X)
    // usando seções transversais em Z para esculpir em 3D tanto o vinco das orelhas traseiras
    // quanto a saia perimetral espessa e o chanfro da garganta em "V" (Imagens 1, 2 e 3).
    const zStations = [
        -0.455, // Ponta extrema traseira da orelha
        -0.425, // Quina traseira chanfrada da orelha
        -0.340, // Meio da rampa inferior da orelha
        -0.240, // Acima na rampa da orelha
        -0.145, // Linha de vinco/transição entre as orelhas inclinadas e o platô principal
        -0.080, // Início do canal reto do pino-rei
        -0.020, // Entrada do círculo do pino-rei
         0.015, // Centro do furo circular do pino-rei (Z = +0.015m)
         0.050, // Topo do arco circular do pino-rei
         0.075, // Fechamento imediatamente à frente do furo do pino-rei
         0.160, // Região central-frontal (fim da aba lateral máxima)
         0.255, // Chanfro diagonal frontal-lateral
         0.315, // Curva do ombro frontal
         0.338  // Borda frontal reta
    ];

    const getOuterXAtZ = (z) => {
        const pts = [
            [-0.455, 0.215],
            [-0.425, 0.268],
            [-0.340, 0.320],
            [-0.240, 0.378],
            [-0.145, 0.432],
            [-0.080, 0.452],
            [ 0.015, 0.458],
            [ 0.075, 0.454],
            [ 0.160, 0.438],
            [ 0.255, 0.372],
            [ 0.315, 0.285],
            [ 0.338, 0.210]
        ];
        if (z <= pts[0][0]) return pts[0][1];
        if (z >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
        for (let i = 0; i < pts.length - 1; i++) {
            const [z0, x0] = pts[i];
            const [z1, x1] = pts[i + 1];
            if (z >= z0 && z <= z1) {
                const t = (z - z0) / (z1 - z0);
                return THREE.MathUtils.lerp(x0, x1, t);
            }
        }
        return 0.40;
    };

    const getInnerXAtZ = (z) => {
        // Na frente do furo do pino-rei (z > 0.073m), as duas metades se encontram no centro (x = 0)
        if (z >= 0.074) return 0.0;
        // Furo circular central do pino-rei centrado em z = 0.015m com raio R = 0.059m
        const zPin = 0.015;
        const rPin = 0.059;
        if (z >= -0.020 && z < 0.074) {
            const dz = z - zPin;
            return Math.sqrt(Math.max(0.0, rPin * rPin - dz * dz));
        }
        // Canal reto curto entre z = -0.11m e z = -0.02m
        if (z >= -0.110) {
            const t = (z - (-0.110)) / (-0.020 - (-0.110));
            return THREE.MathUtils.lerp(0.062, 0.048, t);
        }
        // Garganta / Guia em "V" abrindo até as pontas traseiras (de 0.062m em z=-0.11m até 0.165m em z=-0.455m)
        const u = THREE.MathUtils.clamp((-0.110 - z) / (0.455 - 0.110), 0, 1);
        return THREE.MathUtils.lerp(0.062, 0.165, Math.pow(u, 1.08));
    };

    [-1, 1].forEach(side => {
        const halfSections = [];
        for (const z of zStations) {
            const xIn = getInnerXAtZ(z);
            const xOut = getOuterXAtZ(z);
            const yTop = getRampDropY(z);
            const skirtD = getSkirtDepth(z);
            const yBot = yTop - skirtD;
            const bevOut = 0.012;
            const bevIn = xIn > 0.005 ? 0.010 : 0.0;

            // Entalhe sutil no centro da borda frontal (visível no topo da Imagem 1)
            const yTopIn = (z > 0.30 && xIn === 0) ? yTop - 0.004 : yTop;

            const ring = [
                [side * xIn, yBot + 0.012, z],
                [side * xIn, yTopIn - (bevIn > 0 ? 0.006 : 0), z],
                [side * (xIn + bevIn), yTopIn, z],
                [side * (xOut - bevOut), yTop, z],
                [side * xOut, yTop - 0.008, z],
                [side * (xOut - 0.006), yBot, z],
                [side * Math.max(xIn, xOut - 0.055), yBot, z]
            ];
            if (side > 0) ring.reverse();
            halfSections.push(ring);
        }
        const halfGeo = createLoftedGeometry(halfSections, true, true, true, 0.48);
        plateGroup.add(new THREE.Mesh(halfGeo, mats.chassis));
    });

    // ========================================================================
    // 4. MANCAIS LATERAIS DA SAIA, PINOS DE ARTICULAÇÃO E BICOS DE GRAXEIRA
    //    (Fiel à Imagem 3: alojamento lateral do pino na saia + 2 graxeiras)
    // ========================================================================
    [-1, 1].forEach(side => {
        // Boss lateral na saia do prato envolvendo o pino de articulação com o pedestal
        const pivotBoss = new THREE.Mesh(
            new RoundedBoxGeometry(0.055, 0.072, 0.145, 2, 0.012),
            mats.chassis
        );
        pivotBoss.position.set(side * 0.432, -0.042, 0.02);
        plateGroup.add(pivotBoss);

        // Bucha de borracha preta e pino sextavado pesado de articulação (visível na Imagem 3)
        const bushing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.028, 0.062, 16),
            mats.rubber
        );
        bushing.rotation.z = Math.PI / 2;
        bushing.position.set(side * 0.434, -0.045, 0.02);
        plateGroup.add(bushing);

        const pivotBolt = new THREE.Mesh(
            new THREE.CylinderGeometry(0.019, 0.019, 0.072, 6),
            mats.chassis
        );
        pivotBolt.rotation.z = Math.PI / 2;
        pivotBolt.position.set(side * 0.436, -0.045, 0.02);
        plateGroup.add(pivotBolt);

        // Bloco interno de acoplamento do mancal sob o prato (mantém conexão sólida com o pedestal em qualquer alturaBase)
        const upperTrunnionSocket = new THREE.Mesh(
            new RoundedBoxGeometry(0.132, 0.042, 0.20, 2, 0.008),
            mats.chassis
        );
        upperTrunnionSocket.position.set(side * (0.295 - inwardShiftX), -0.048, 0.02);
        plateGroup.add(upperTrunnionSocket);
    });

    // Dois bicos de lubrificação / graxeiras (Zerk Fittings) na borda lateral-frontal da saia (Imagem 3)
    const zerkBlock = new THREE.Mesh(
        new RoundedBoxGeometry(0.024, 0.022, 0.056, 2, 0.004),
        mats.chassis
    );
    zerkBlock.position.set(0.415, -0.028, 0.215);
    zerkBlock.rotation.y = 0.42;
    plateGroup.add(zerkBlock);

    [-0.012, 0.012].forEach(dz => {
        const zerk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0045, 0.006, 0.018, 8),
            mats.polishedAluminum
        );
        zerk.rotation.z = -Math.PI / 2;
        zerk.position.set(0.426, -0.028, 0.215 + dz);
        plateGroup.add(zerk);
    });

    // ========================================================================
    // 5. COLAR CENTRAL DO PINO-REI, 4 PARAFUSOS E GARRA INTERNA DE TRAVAMENTO
    //    (Fiel às Imagens 1, 2 e 3: anel em ferradura com 4 parafusos e garra interna)
    // ========================================================================
    const zPinCenter = 0.015;

    // Fundo escuro interno e mecanismo da garra de travamento (Locking Jaw & Lock Bar) dentro do furo
    const jawHousingFloor = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.018, 0.18),
        mats.rubber
    );
    jawHousingFloor.position.set(0, -0.034, zPinCenter - 0.01);
    plateGroup.add(jawHousingFloor);

    // Garra curva de travamento (Locking Jaw) cruzando parcialmente a cavidade do pino-rei (Imagens 1 e 2)
    const jawHook = new THREE.Mesh(
        new THREE.TorusGeometry(0.042, 0.014, 10, 18, Math.PI * 1.15),
        mats.chassis
    );
    jawHook.rotation.x = Math.PI / 2;
    jawHook.rotation.z = 0.25;
    jawHook.position.set(-0.006, -0.016, zPinCenter + 0.005);
    plateGroup.add(jawHook);

    // Barra transversal de trava (Lock Bar) ao fundo da garganta (visível nas Imagens 1 e 2)
    const lockBar = new THREE.Mesh(
        new RoundedBoxGeometry(0.11, 0.016, 0.034, 2, 0.004),
        mats.chassis
    );
    lockBar.position.set(0, -0.022, zPinCenter - 0.042);
    lockBar.rotation.y = 0.12;
    plateGroup.add(lockBar);

    // Anel / Colar em Ferradura (Central Wear Ring Collar) contornando o furo do pino-rei
    const collarOuterR = 0.104;
    const collarInnerR = 0.060;
    const collarShape = new THREE.Shape();
    collarShape.absarc(0, 0, collarOuterR, -Math.PI * 0.32, Math.PI * 1.32, false);
    collarShape.absarc(0, 0, collarInnerR, Math.PI * 1.32, -Math.PI * 0.32, true);
    collarShape.closePath();

    // Sulco escuro perimetral do colar central
    const collarGrooveGeo = new THREE.ExtrudeGeometry(collarShape, {
        steps: 1,
        depth: 0.004,
        bevelEnabled: false,
        curveSegments: 24
    });
    collarGrooveGeo.rotateX(Math.PI / 2);
    const collarGroove = new THREE.Mesh(collarGrooveGeo, mats.rubber);
    collarGroove.position.set(0, 0.0045, zPinCenter);
    plateGroup.add(collarGroove);

    // Anel metálico preto do colar central
    const collarRingShape = new THREE.Shape();
    collarRingShape.absarc(0, 0, collarOuterR - 0.005, -Math.PI * 0.30, Math.PI * 1.30, false);
    collarRingShape.absarc(0, 0, collarInnerR + 0.002, Math.PI * 1.30, -Math.PI * 0.30, true);
    collarRingShape.closePath();
    const collarRingGeo = new THREE.ExtrudeGeometry(collarRingShape, {
        steps: 1,
        depth: 0.006,
        bevelEnabled: true,
        bevelThickness: 0.0015,
        bevelSize: 0.0015,
        bevelSegments: 1,
        curveSegments: 24
    });
    collarRingGeo.rotateX(Math.PI / 2);
    const collarRing = new THREE.Mesh(collarRingGeo, mats.chassis);
    collarRing.position.set(0, 0.007, zPinCenter);
    plateGroup.add(collarRing);

    // 4 Parafusos Allen prateados cravados no colar central + orelha lateral esquerda (Imagens 1 e 2)
    const collarBoltRecessGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.005, 12);
    const collarBoltHeadGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.006, 10);
    const collarBoltSocketGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.0065, 6);
    const rCollarBolt = (collarOuterR + collarInnerR) * 0.5;
    [-0.18, 0.92, 2.22, 3.32].forEach(ang => {
        const bx = Math.cos(ang) * rCollarBolt;
        const bz = zPinCenter + Math.sin(ang) * rCollarBolt;

        const recess = new THREE.Mesh(collarBoltRecessGeo, mats.rubber);
        recess.position.set(bx, 0.0055, bz);
        plateGroup.add(recess);

        const head = new THREE.Mesh(collarBoltHeadGeo, mats.polishedAluminum);
        head.position.set(bx, 0.0062, bz);
        plateGroup.add(head);

        const socket = new THREE.Mesh(collarBoltSocketGeo, mats.rubber);
        socket.position.set(bx, 0.0066, bz);
        plateGroup.add(socket);
    });

    // Orelha circular lateral esquerda do colar central (visível às 9h do colar na Imagem 1)
    const leftLugOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.006, 14),
        mats.chassis
    );
    leftLugOuter.position.set(0.105, 0.004, zPinCenter + 0.026);
    plateGroup.add(leftLugOuter);

    const leftLugHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.007, 12),
        mats.rubber
    );
    leftLugHole.position.set(0.105, 0.0045, zPinCenter + 0.026);
    plateGroup.add(leftLugHole);

    const leftLugPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.0075, 10),
        mats.polishedAluminum
    );
    leftLugPin.position.set(0.105, 0.005, zPinCenter + 0.026);
    plateGroup.add(leftLugPin);

    // ========================================================================
    // 6. CANAIS DE LUBRIFICAÇÃO (GREASE GROOVES), PLATÔ EM FERRADURA E RELEVO "JOST"
    //    (Fiel às Imagens 1, 2 e 3)
    // ========================================================================
    // Canal longitudinal central na frente (dividindo o topo entre esquerda e direita)
    const frontCenterChannel = new THREE.Mesh(
        new RoundedBoxGeometry(0.026, 0.005, 0.145, 2, 0.002),
        mats.rubber
    );
    frontCenterChannel.position.set(0, 0.001, 0.258);
    plateGroup.add(frontCenterChannel);

    // Moldura retangular frontal em relevo ("JOST" cast boss entre z = 0.13m e z = 0.19m)
    const brandPlateRecess = new THREE.Mesh(
        new RoundedBoxGeometry(0.215, 0.0045, 0.056, 2, 0.004),
        mats.rubber
    );
    brandPlateRecess.position.set(0, 0.0012, 0.160);
    plateGroup.add(brandPlateRecess);

    // 4 Blocos tipográficos fundidos em relevo preto estilizando "J O S T" dentro da moldura
    [-0.072, -0.024, 0.024, 0.072].forEach((lx, idx) => {
        const letterBlock = new THREE.Mesh(
            new RoundedBoxGeometry(0.036, 0.006, 0.038, 1, 0.002),
            mats.chassis
        );
        letterBlock.position.set(lx, 0.0022, 0.160);
        plateGroup.add(letterBlock);

        if (idx === 1) {
            // Miolo vazado do "O"
            const oHole = new THREE.Mesh(
                new THREE.BoxGeometry(0.014, 0.0065, 0.016),
                mats.rubber
            );
            oHole.position.set(lx, 0.0024, 0.160);
            plateGroup.add(oHole);
        }
    });

    // Sulcos de lubrificação internos (contornando o platô central em ferradura) e externos
    // com as 3 ramificações transversais em cada lado (Imagem 1)
    [-1, 1].forEach(side => {
        // Sulco interno contornando o lobo central de cada lado
        const innerLoopPts = [
            new THREE.Vector3(side * 0.095, 0.0025, -0.125),
            new THREE.Vector3(side * 0.175, 0.0025, -0.095),
            new THREE.Vector3(side * 0.218, 0.0025, -0.020),
            new THREE.Vector3(side * 0.218, 0.0025,  0.090),
            new THREE.Vector3(side * 0.185, 0.0025,  0.165),
            new THREE.Vector3(side * 0.115, 0.0025,  0.192),
            new THREE.Vector3(side * 0.035, 0.0025,  0.195)
        ];
        const innerLoopCurve = new THREE.CatmullRomCurve3(innerLoopPts);
        const innerGroove = new THREE.Mesh(
            new THREE.TubeGeometry(innerLoopCurve, 24, 0.0055, 8, false),
            mats.rubber
        );
        innerGroove.scale.set(1, 0.45, 1);
        plateGroup.add(innerGroove);

        // Sulco curvo externo de retenção de graxa (arco longo de z = -0.15m até z = +0.26m)
        const outerArcPts = [
            new THREE.Vector3(side * 0.205, 0.0025, -0.145),
            new THREE.Vector3(side * 0.268, 0.0025, -0.095),
            new THREE.Vector3(side * 0.302, 0.0025, -0.010),
            new THREE.Vector3(side * 0.304, 0.0025,  0.090),
            new THREE.Vector3(side * 0.272, 0.0025,  0.185),
            new THREE.Vector3(side * 0.205, 0.0025,  0.242),
            new THREE.Vector3(side * 0.110, 0.0025,  0.265)
        ];
        const outerArcCurve = new THREE.CatmullRomCurve3(outerArcPts);
        const outerGroove = new THREE.Mesh(
            new THREE.TubeGeometry(outerArcCurve, 28, 0.006, 8, false),
            mats.rubber
        );
        outerGroove.scale.set(1, 0.45, 1);
        plateGroup.add(outerGroove);

        // 3 Ramificações transversais curtas cruzando o sulco curvo externo (visíveis na Imagem 1)
        [
            { x: 0.268, z: -0.095, ang: -0.58 },
            { x: 0.305, z:  0.025, ang:  0.00 },
            { x: 0.265, z:  0.190, ang:  0.65 }
        ].forEach(branch => {
            const crossBar = new THREE.Mesh(
                new RoundedBoxGeometry(0.056, 0.005, 0.012, 2, 0.003),
                mats.rubber
            );
            crossBar.position.set(side * branch.x, 0.0018, branch.z);
            crossBar.rotation.y = side * branch.ang;
            plateGroup.add(crossBar);
        });

        // 2 Furos pequenos de pino elástico/dreno no platô central (visíveis na Imagem 1)
        const smallHoleGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 10);
        const smallHole = new THREE.Mesh(smallHoleGeo, mats.rubber);
        smallHole.position.set(side * 0.138, 0.002, side > 0 ? -0.015 : 0.065);
        plateGroup.add(smallHole);
    });

    // ========================================================================
    // 7. OS 4 GRUPOS DE 3 FUROS CIRCULARES LATERAIS (2 FILEIRAS DE 3 EM CADA LADO)
    //    (Muito marcantes nas Imagens 1, 2 e 3: cavidade rebaixada + bucha/anel prateado)
    // ========================================================================
    const pocketOuterGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.006, 14);
    const pocketBushingGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.0065, 14);
    const pocketCenterHoleGeo = new THREE.CylinderGeometry(0.0052, 0.0052, 0.007, 10);

    [-1, 1].forEach(side => {
        [-0.052, 0.098].forEach(zRow => {
            [0.342, 0.378, 0.414].forEach(absX => {
                const px = side * absX;
                const pocketOuter = new THREE.Mesh(pocketOuterGeo, mats.rubber);
                pocketOuter.position.set(px, 0.0015, zRow);
                plateGroup.add(pocketOuter);

                const pocketBushing = new THREE.Mesh(pocketBushingGeo, mats.polishedAluminum);
                pocketBushing.position.set(px, 0.0020, zRow);
                plateGroup.add(pocketBushing);

                const pocketCenter = new THREE.Mesh(pocketCenterHoleGeo, mats.rubber);
                pocketCenter.position.set(px, 0.0025, zRow);
                plateGroup.add(pocketCenter);
            });
        });
    });

    // ========================================================================
    // 8. MECANISMO DE TRAVA LATERAL-FRONTAL E ALAVANCA COM PUNHO EM ANEL OVAL FECHADO
    //    (Fiel às Imagens 1, 2 e 3: suporte com mola/parafuso no canto dianteiro
    //     e alavanca preta saindo pela lateral com punho oblongo fechado)
    // ========================================================================
    const handleSide = -1; // Lado direito (-X) como nas Imagens 1 e 2 (ou visível na lateral da Imagem 3)

    // Suporte e trava de segurança (Secondary Lock Latch & Spring Bracket) no canto dianteiro-lateral (Imagens 1 e 2)
    const latchBracket = new THREE.Mesh(
        new RoundedBoxGeometry(0.075, 0.028, 0.085, 2, 0.004),
        mats.chassis
    );
    latchBracket.position.set(handleSide * 0.395, -0.018, 0.215);
    latchBracket.rotation.y = handleSide * 0.35;
    plateGroup.add(latchBracket);

    const latchPawl = new THREE.Mesh(
        new RoundedBoxGeometry(0.092, 0.012, 0.022, 2, 0.003),
        mats.chassis
    );
    latchPawl.position.set(handleSide * 0.422, -0.012, 0.242);
    latchPawl.rotation.y = handleSide * 0.15;
    plateGroup.add(latchPawl);

    // Parafuso e mola prateados do mecanismo de trava (visíveis no canto superior direito das Imagens 1 e 2)
    const latchBolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.065, 8),
        mats.polishedAluminum
    );
    latchBolt.rotation.x = Math.PI / 2;
    latchBolt.position.set(handleSide * 0.432, -0.014, 0.222);
    plateGroup.add(latchBolt);

    // Haste da alavanca de destravamento (Release Handle Rod) saindo da lateral do prato com leve curva
    const handleCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(handleSide * 0.320, -0.026, 0.095),
        new THREE.Vector3(handleSide * 0.445, -0.024, 0.105),
        new THREE.Vector3(handleSide * 0.505, -0.020, 0.072),
        new THREE.Vector3(handleSide * 0.565, -0.018, 0.048)
    ]);
    const handleShaft = new THREE.Mesh(
        new THREE.TubeGeometry(handleCurve, 16, 0.0085, 10, false),
        mats.chassis
    );
    plateGroup.add(handleShaft);

    // Punho em Anel Oblongo/Oval Fechado (Closed Loop Grip) na ponta da alavanca (Imagens 2 e 3)
    const gripLoopPts = [];
    const gripRx = 0.028;
    const gripRz = 0.056;
    const gripSteps = 24;
    for (let i = 0; i <= gripSteps; i++) {
        const a = (i / gripSteps) * Math.PI * 2;
        // Formato de estádio/oval alongado como na Imagem 2
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const signC = ca >= 0 ? 1 : -1;
        const signS = sa >= 0 ? 1 : -1;
        const px = signC * Math.pow(Math.abs(ca), 0.72) * gripRx;
        const pz = signS * Math.pow(Math.abs(sa), 0.72) * gripRz;
        gripLoopPts.push(new THREE.Vector3(px, 0, pz));
    }
    const gripLoopCurve = new THREE.CatmullRomCurve3(gripLoopPts, true);
    const gripLoopMesh = new THREE.Mesh(
        new THREE.TubeGeometry(gripLoopCurve, 28, 0.0075, 10, true),
        mats.chassis
    );
    gripLoopMesh.position.set(handleSide * 0.592, -0.018, 0.036);
    gripLoopMesh.rotation.y = handleSide * 0.38;
    plateGroup.add(gripLoopMesh);

    return group;
}

// ============================================================================
// 2. PARA-CHOQUE DIANTEIRO "TEXAS SQUARE" CROMADO (18" DEEP DROP BUMPER)
// ============================================================================

function buildTexasSquareBumper(mats) {
    const group = new THREE.Group();
    const zFront = 3.945; // Projeta ~2 cm à frente da base da grade e dos paralamas (3.925m), formando o degrau superior cromado
    const zDepth = 0.11;  // Abas superior, inferior e laterais dobradas para trás (de Z = 3.945m até Z = 3.835m)
    const width = 2.38;   // Largura total do para-choque = 2.38m (±1.190m)
    const bScale = width / 2.09; // Escala proporcional de largura (~1.138756)
    const yTop = 0.760;   // Encostado na base da grade e dos paralamas dianteiros
    const yBot = 0.340;   // Altura fiel à referência (~42 cm de lâmina vertical)
    const height = yTop - yBot; // 0.42m
    const yCenter = (yTop + yBot) / 2; // 0.55m

    // 1. Corpo principal cromado "Texas Square" com cantos vivos e leve dobra nas extremidades
    const mainBumper = new THREE.Mesh(
        new RoundedBoxGeometry(width, height, zDepth, 3, 0.012),
        mats.chrome
    );
    mainBumper.position.set(0, yCenter, zFront - zDepth / 2);
    group.add(mainBumper);

    // 2. Dois recortes quadrados arredondados superiores para pinos de reboque (Tow Hook Holes) sob as laterais da grade
    const yTow = yTop - 0.105; // Y = 0.655m
    [-0.39 * bScale, 0.39 * bScale].forEach(xTow => {
        // Moldura/borda interna dobrada do recorte
        const towLip = new THREE.Mesh(
            new RoundedBoxGeometry(0.072 * bScale, 0.078, 0.016, 2, 0.012),
            mats.chrome
        );
        towLip.position.set(xTow, yTow, zFront - 0.002);
        group.add(towLip);

        // Fundo escuro profundo do recorte
        const towHole = new THREE.Mesh(
            new RoundedBoxGeometry(0.056 * bScale, 0.062, 0.018, 2, 0.008),
            mats.wheelWellLiner
        );
        towHole.position.set(xTow, yTow, zFront - 0.001);
        group.add(towHole);
    });

    // 3. Recorte retangular central inferior (degrau/entrada de ar central na base do para-choque)
    const yCenterCut = yBot + 0.082; // Y = 0.422m
    const centerCutLip = new THREE.Mesh(
        new RoundedBoxGeometry(0.155 * bScale, 0.074, 0.016, 2, 0.012),
        mats.chrome
    );
    centerCutLip.position.set(0, yCenterCut, zFront - 0.002);
    group.add(centerCutLip);

    const centerCutHole = new THREE.Mesh(
        new RoundedBoxGeometry(0.138 * bScale, 0.058, 0.018, 2, 0.008),
        mats.wheelWellLiner
    );
    centerCutHole.position.set(0, yCenterCut, zFront - 0.001);
    group.add(centerCutHole);

    // 4. Dois Faróis de Neblina/Milha retangulares embutidos na parte inferior externa (alinhados aos faróis principais)
    const yFog = yBot + 0.095; // Y = 0.435m
    [-0.712 * bScale, 0.712 * bScale].forEach(xFog => {
        // Moldura cromada chanfrada embutida
        const fogBezel = new THREE.Mesh(
            new RoundedBoxGeometry(0.142 * bScale, 0.092, 0.016, 2, 0.010),
            mats.chrome
        );
        fogBezel.position.set(xFog, yFog, zFront - 0.001);
        group.add(fogBezel);

        // Cavidade escura interna do refletor
        const fogRecess = new THREE.Mesh(
            new THREE.BoxGeometry(0.124 * bScale, 0.074, 0.017),
            mats.chassis
        );
        fogRecess.position.set(xFog, yFog, zFront);
        group.add(fogRecess);

        // Lente retangular cristalina do farol de neblina
        const fogLens = new THREE.Mesh(
            new THREE.BoxGeometry(0.114 * bScale, 0.064, 0.019),
            mats.headlightLens
        );
        fogLens.position.set(xFog, yFog, zFront + 0.001);
        group.add(fogLens);
    });

    // 5. Parafusos cromados abaulados (Carriage Bolts) de fixação na face frontal e nas abas laterais
    const boltGeo = new THREE.SphereGeometry(0.0075, 10, 8);
    const frontBoltCoords = [
        [-0.84 * bScale, yTop - 0.14],
        [-0.31 * bScale, yTop - 0.16],
        [0.00, yTop - 0.16],
        [0.31 * bScale, yTop - 0.16],
        [0.84 * bScale, yTop - 0.14],
        [-0.31 * bScale, yBot + 0.13],
        [0.31 * bScale, yBot + 0.13]
    ];
    frontBoltCoords.forEach(([bx, by]) => {
        const bolt = new THREE.Mesh(boltGeo, mats.chrome);
        bolt.scale.set(1.0, 1.0, 0.55);
        bolt.position.set(bx, by, zFront + 0.002);
        group.add(bolt);
    });

    // Parafusos nas abas laterais do para-choque (visíveis de perfil)
    [-1, 1].forEach(side => {
        [yTop - 0.11, yBot + 0.11].forEach(by => {
            [zFront - 0.038, zFront - 0.075].forEach(bz => {
                const sideBolt = new THREE.Mesh(boltGeo, mats.chrome);
                sideBolt.scale.set(0.55, 1.0, 1.0);
                sideBolt.position.set(side * (width / 2 + 0.001), by, bz);
                group.add(sideBolt);
            });
        });
    });

    return group;
}

// ============================================================================
// 3. GRADE FRONTAL AUTÊNTICA KENWORTH W900L + EMBLEMA "KW BUG"
// ============================================================================

function buildAuthenticW900Grille(mats) {
    const grilleGroup = new THREE.Group();
    const gW = 2 * CONE_W_START; // Largura frontal do capô proporcional à nova largura (0.98 * 2.38/2.09 ≈ 1.116m)
    const gH = HOOD_Y_TOP - HOOD_Y_BOT; // De Y=0.76m (topo do para-choque) até Y=1.99m (topo do capô) = 1.23m
    const baseGrilleD = 0.09;
    const gD = 0.08;             // Dimensão Z dos pilares laterais reduzida de 9 cm (0.09m) para 8 cm (0.08m)
    const sZ = gD / baseGrilleD; // Fator de escala proporcional em Z (8/9) para manter todas as peças proporcionais
    const grilleFrontZ = 3.925;  // Posição Z fixa da face frontal da grade (inalterada em 3.925m)
    const grilleCenterZ = grilleFrontZ - gD / 2; // 3.885m (face traseira dos pilares/coroa em Z = 3.845m)

    // Posicionada na frente do capô (Z = 3.885m, face frontal fixa em Z = 3.925m, base em Y = 0.76m e topo em Y = 1.99m)
    grilleGroup.position.set(0, HOOD_Y_BOT + gH / 2, grilleCenterZ);
    grilleGroup.rotation.x = 0.0;

    // Moldura externa esculpida da grade (pilares laterais terminam sob a coroa superior curvada, sem sobressair nos cantos)
    const pillarH = gH - 0.08;
    const sidePillarGeo = new RoundedBoxGeometry(0.085, pillarH, gD, 3, 0.018 * sZ);
    [-1, 1].forEach(side => {
        const pillar = new THREE.Mesh(sidePillarGeo, mats.chrome);
        pillar.position.set(side * (gW / 2 - 0.042), -0.04, 0);
        grilleGroup.add(pillar);
    });

    const bottomBar = new THREE.Mesh(
        new RoundedBoxGeometry(gW, 0.095, (baseGrilleD + 0.02) * sZ, 3, 0.015 * sZ),
        mats.chrome
    );
    bottomBar.position.set(0, -gH / 2 + 0.0475, -0.005 * sZ);
    grilleGroup.add(bottomBar);

    // Coroa Superior Esculpida da Grade W900L (alinhada ao topo do capô em Y = +gH/2 -> 1.99m)
    const headerStations = [];
    const headerSteps = 8;
    const halfW = gW / 2 + 0.006;
    for (let i = 0; i <= headerSteps; i++) {
        const u = (i / headerSteps) * 2 - 1; // -1 a +1
        const x = u * halfW;
        const crownDrop = 0.045 * (u * u);
        const yTop = gH / 2 - crownDrop;
        const yBot = gH / 2 - 0.13 - crownDrop * 0.25;
        const zF = gD / 2 + 0.008 * sZ;
        const zB = -gD / 2;

        headerStations.push([
            [x, yTop, zB],
            [x, yTop, zF - 0.018 * sZ],
            [x, yTop - 0.018, zF],
            [x, yBot + 0.015, zF],
            [x, yBot, zF - 0.012 * sZ],
            [x, yBot, zB]
        ]);
    }
    const headerGeo = createLoftedGeometry(headerStations, true, true, true, 0.65);
    grilleGroup.add(new THREE.Mesh(headerGeo, mats.chrome));

    // Parte frontal do friso central superior (8 cm de largura) que passa sobre a coroa cromada da grade do radiador (integrada à grade em mats.chrome)
    const grilleSpineSections = [];
    const zGrilleSpineFront = gD / 2 + 0.007 * sZ; // Z mundo ≈ 3.9312m (toca o topo do emblema KW Bug)
    const zGrilleSpineRear = -gD / 2;              // Z mundo = 3.845m (borda traseira exata da coroa cromada da grade)
    const yCrownLocal = gH / 2;                    // Y mundo = HOOD_Y_TOP (1.99m)
    const swGrille = 0.04;                         // Meia-largura = 4 cm -> Largura total = 8 cm (0.08m)
    const shGrille = 0.012;
    for (let i = 0; i <= 4; i++) {
        const zLoc = THREE.MathUtils.lerp(zGrilleSpineFront, zGrilleSpineRear, i / 4);
        grilleSpineSections.push([
            [-swGrille, yCrownLocal - 0.003, zLoc],
            [-swGrille * 0.7, yCrownLocal + shGrille, zLoc],
            [swGrille * 0.7, yCrownLocal + shGrille, zLoc],
            [swGrille, yCrownLocal - 0.003, zLoc]
        ]);
    }
    grilleGroup.add(new THREE.Mesh(createLoftedGeometry(grilleSpineSections, false, true, true, 0.6), mats.chrome));

    // Fundo escuro texturizado do radiador
    const innerW = gW - 0.16;
    const innerH = gH - 0.18;
    const meshBacking = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), mats.radiatorMesh);
    meshBacking.position.set(0, -0.02, -0.01 * sZ);
    grilleGroup.add(meshBacking);

    // Barra vertical central larga (Divisor característico da grade W900)
    const centerDivider = new THREE.Mesh(
        new RoundedBoxGeometry(0.042, innerH + 0.02, gD * 0.85, 2, 0.008 * sZ),
        mats.chrome
    );
    centerDivider.position.set(0, -0.02, 0.005 * sZ);
    grilleGroup.add(centerDivider);

    // 16 Aletas Verticais de Inox Polido (8 em cada metade da grade) + 3 hastes horizontais traseiras
    const louverGeo = new THREE.BoxGeometry(0.011, innerH, 0.045 * sZ);
    const halfInner = (innerW / 2) - 0.025;
    const louversPerSide = 8;
    for (let i = 1; i <= louversPerSide; i++) {
        const xOff = 0.022 + (i / (louversPerSide + 0.6)) * halfInner;
        [-1, 1].forEach(side => {
            const louver = new THREE.Mesh(louverGeo, mats.chrome);
            louver.position.set(side * xOff, -0.02, 0.008 * sZ);
            grilleGroup.add(louver);
        });
    }

    [-0.28, -0.02, 0.24].forEach(yRod => {
        const tieRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * sZ, 0.008 * sZ, innerW, 8), mats.chrome);
        tieRod.rotation.z = Math.PI / 2;
        tieRod.position.set(0, yRod, -0.004 * sZ);
        grilleGroup.add(tieRod);
    });

    // Emblema "KW Bug" Cravado no Centro da Coroa da Grade + Ornamento Alado no Topo
    const bugGroup = new THREE.Group();
    bugGroup.position.set(0, gH / 2 - 0.05, gD / 2 + 0.014 * sZ);

    // Medalhão circular vermelho e cromado
    const medallionRim = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.016 * sZ, 20), mats.chrome);
    medallionRim.rotation.x = Math.PI / 2;
    bugGroup.add(medallionRim);

    const medallionRed = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.019 * sZ, 20), mats.kwRedBadge);
    medallionRed.rotation.x = Math.PI / 2;
    bugGroup.add(medallionRed);

    const medallionInnerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.021 * sZ, 16), mats.chrome);
    medallionInnerRing.rotation.x = Math.PI / 2;
    bugGroup.add(medallionInnerRing);

    // Placa vertical com as 3 listras vermelhas verticais da Kenworth
    const bugStem = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.21, 0.014 * sZ), mats.chrome);
    bugStem.position.set(0, -0.02, -0.002 * sZ);
    bugGroup.add(bugStem);

    [-0.018, 0, 0.018].forEach(xStripe => {
        const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.19, 0.017 * sZ), mats.kwRedBadge);
        redBar.position.set(xStripe, -0.02, 0);
        bugGroup.add(redBar);
    });

    grilleGroup.add(bugGroup);
    return grilleGroup;
}

// ============================================================================
// 4. CAPÔ LONGO ESCULPIDO DA KENWORTH W900L (TAPERED & CROWNED LONG HOOD)
// ============================================================================

/**
 * Geometria Cônica Contínua (Capô + Núcleo da Cabine):
 * - Capô: comprimento = 1.53m (de Z = 3.86 até Z = 2.33)
 * - Núcleo: trecho visível no centro até o ápice do sleeper (Z = 1.21m) = 1.12m; estendido nas laterais até Z = 1.03m para tocar 100% a frente curva do Sleeper
 * - Largura na extremidade frontal do capô: 0.98m (CONE_W_START = 0.49m)
 * - Largura na extremidade traseira do núcleo: 1.46m (CONE_W_END = 0.73m)
 * As laterais do capô e do núcleo seguem uma única linha reta contínua de Z = 3.86 até Z = 1.03.
 */
const CAB_Z_SHIFT = 0.0;
const HOOD_Z_START = 3.86;
const HOOD_Z_END = 2.33;                          // Fim do capô / início do núcleo (comprimento do capô = 1.53m)
const NUCLEO_Z_START_LOCAL = 2.33;                // Início do núcleo
const NUCLEO_Z_END_LOCAL = 1.03;                  // Fim do núcleo nas laterais (no centro toca o ápice do sleeper em Z = 1.21 -> 1.12m visíveis)
const NUCLEO_Z_END_WORLD = NUCLEO_Z_END_LOCAL + CAB_Z_SHIFT; // 1.03m

const CAB_WIDTH_SCALE = 2.38 / 2.09;              // Fator de escala proporcional de largura (sleeper de 2.09m -> 2.38m)
const CONE_W_START = 0.49 * CAB_WIDTH_SCALE;      // Meia-largura frontal no início do capô (~0.5580m -> ~1.116m total, inalterada)
const CONE_W_END = 0.93;                          // Meia-largura traseira no final do núcleo (0.93m -> 1.86m de largura total)

function getHoodSectionParams(worldZ) {
    // Interpolação estritamente linear desde o início do capô (worldZ = 3.86) até o final do núcleo (worldZ = 1.03, limitado em 1.0 na aba de vedação traseira)
    const uCone = Math.min(1.0, (HOOD_Z_START - worldZ) / (HOOD_Z_START - NUCLEO_Z_END_WORLD));
    const t = THREE.MathUtils.clamp((HOOD_Z_START - worldZ) / (HOOD_Z_START - HOOD_Z_END), 0, 1);

    // Linhas 100% retas do início do capô ao final do núcleo (sem tSmooth / sem curvas)
    const wFlank = THREE.MathUtils.lerp(CONE_W_START, CONE_W_END, uCone);
    const wShoulder = wFlank - 0.02;
    const wTop = wFlank - 0.065;

    // Topo constante em Y = 1.99m (1.10m acima do chassi) e base estendida para baixo até Y = 0.76m (topo do para-choque)
    const yBottom = HOOD_Y_BOT;                      // 0.76m (tocando o topo do para-choque)
    const yCrown = HOOD_Y_TOP;                       // 1.99m (0.89m + 1.10m, constante em toda a extensão do capô)
    const yTopEdge = yCrown - 0.045;                 // 1.945m
    const yShoulder = yTopEdge - 0.055;              // 1.89m
    const yCrease = yShoulder - 0.15;                // 1.74m
    const yLatchLine = yBottom + 0.18;               // 0.94m

    return { uCone, t, wTop, wShoulder, wFlank, yCrown, yTopEdge, yShoulder, yCrease, yBottom, yLatchLine };
}

function buildSculptedW900Hood(mats) {
    const group = new THREE.Group();

    const zStart = HOOD_Z_START;
    const zEnd = HOOD_Z_END;
    const hoodZStations = [];
    const numFrontStations = 28;
    for (let i = 0; i <= numFrontStations; i++) {
        hoodZStations.push(THREE.MathUtils.lerp(zStart, 2.56, i / numFrontStations));
    }
    hoodZStations.push(2.555, 2.48, 2.40, zEnd);
    const hoodSections = [];

    for (const z of hoodZStations) {
        const p = getHoodSectionParams(z);
        // Atrás do arco traseiro do paralama dianteiro (Z <= 2.555m), a parede pintada do capô termina em CHASSIS_Y_TOP (0.89m).
        // Sobre a abertura da caixa de roda dianteira, a parede vermelha pintada recua para cima do arco interno (yArchIn + 0.018m)
        // para nunca aparecer vermelha dentro da caixa de roda atrás do pneu.
        const dzFender = z - DEFAULT_FENDER_PARAMS.posZ;
        const rInnerFender = DEFAULT_FENDER_PARAMS.holeRadius;
        const yArchIn = Math.abs(dzFender) < rInnerFender
            ? DEFAULT_FENDER_PARAMS.posY + Math.sqrt(rInnerFender * rInnerFender - dzFender * dzFender) + 0.018
            : p.yBottom;
        const yBotAtZ = z <= 2.555 ? CHASSIS_Y_TOP : Math.max(p.yBottom, yArchIn);

        // Perfil transversal fechado da direita (-X) para a esquerda (+X)
        hoodSections.push([
            [-p.wFlank, yBotAtZ, z],
            [-p.wFlank, p.yCrease, z],
            [-p.wShoulder, p.yShoulder, z],
            [-p.wTop, p.yTopEdge, z],
            [-p.wTop * 0.48, p.yCrown - 0.01, z],
            [0, p.yCrown, z],
            [p.wTop * 0.48, p.yCrown - 0.01, z],
            [p.wTop, p.yTopEdge, z],
            [p.wShoulder, p.yShoulder, z],
            [p.wFlank, p.yCrease, z],
            [p.wFlank, yBotAtZ, z]
        ]);
    }

    const hoodGeo = createLoftedGeometry(hoodSections, true, true, true, 0.55);
    group.add(new THREE.Mesh(hoodGeo, mats.paint));

    // Parede lateral inferior do capô dentro da caixa de roda (mats.wheelWellLiner):
    // cobre o trecho da lateral do capô ao fundo atrás dos pneus em sombra escura
    [-1, 1].forEach(side => {
        const innerHoodWallSections = [];
        for (const z of hoodZStations) {
            if (z < 2.52 || z > 3.84) continue;
            const p = getHoodSectionParams(z);
            const dzFender = z - DEFAULT_FENDER_PARAMS.posZ;
            const rInnerFender = DEFAULT_FENDER_PARAMS.holeRadius;
            const yTopDark = Math.abs(dzFender) < rInnerFender
                ? DEFAULT_FENDER_PARAMS.posY + Math.sqrt(rInnerFender * rInnerFender - dzFender * dzFender) + 0.035
                : CHASSIS_Y_TOP + 0.04;
            const yBotDark = CHASSIS_Y_BOT; // 0.56m (até a longarina do chassi)
            const xOutDark = side * (p.wFlank - 0.002);
            const xInDark = side * (p.wFlank - 0.018);

            const ring = [
                [xInDark, yBotDark, z],
                [xInDark, yTopDark, z],
                [xOutDark, yTopDark, z],
                [xOutDark, yBotDark, z]
            ];
            if (side > 0) ring.reverse();
            innerHoodWallSections.push(ring);
        }
        group.add(new THREE.Mesh(createLoftedGeometry(innerHoodWallSections, true, true, true, 0.4), mats.wheelWellLiner));
    });

    // Friso Central no Topo do Capô com 8 cm de largura (0.08m, sw = 0.04m) e mesma pintura vermelha do capô (mats.paint),
    // começando exatamente na borda traseira da moldura cromada da grade do radiador (Z=3.845m) até a haste central do para-brisa (Z=2.25m)
    const spineSections = [];
    const zSpineFront = 3.845; // Encontro exato com a borda traseira da coroa cromada da grade do radiador (3.925 - 0.08)
    const zSpineRear = 2.25;   // Toca a haste cromada central do suporte do para-brisa (em Z=2.26)
    for (let i = 0; i <= 12; i++) {
        const z = THREE.MathUtils.lerp(zSpineFront, zSpineRear, i / 12);
        const p = getHoodSectionParams(z);
        const sw = 0.04; // Meia-largura = 4 cm -> Largura total = 8 cm (0.08m)
        const sh = 0.012;
        spineSections.push([
            [-sw, p.yCrown - 0.003, z],
            [-sw * 0.7, p.yCrown + sh, z],
            [sw * 0.7, p.yCrown + sh, z],
            [sw, p.yCrown - 0.003, z]
        ]);
    }
    group.add(new THREE.Mesh(createLoftedGeometry(spineSections, false, true, true, 0.6), mats.paint));

    // Ângulo exato da reta lateral do cone (Capô + Núcleo)
    const coneSlopeAngle = Math.atan2(CONE_W_END - CONE_W_START, HOOD_Z_START - NUCLEO_Z_END_WORLD);

    // Faixas Laterais Clássicas Kenworth (Branco-Pérola com Filetes Dourados) acompanhando a reta do capô
    [-1, 1].forEach(side => {
        const creamSections = [];
        const goldTopSections = [];
        const goldBotSections = [];

        for (let i = 0; i <= 12; i++) {
            const z = THREE.MathUtils.lerp(zStart - 0.08, zEnd, i / 12);
            const p = getHoodSectionParams(z);
            const xOut = side * (p.wFlank + 0.003);
            const xOutGold = side * (p.wFlank + 0.0045);

            const bandCenterY = p.yShoulder - 0.14;
            const bandHalfH = THREE.MathUtils.lerp(0.055, 0.110, p.t);
            const yTop = bandCenterY + bandHalfH;
            const yBot = bandCenterY - bandHalfH;

            const ptsCream = [
                [xOut, yTop, z],
                [xOut, yBot, z]
            ];
            const ptsGoldTop = [
                [xOutGold, yTop + 0.018, z],
                [xOutGold, yTop - 0.012, z]
            ];
            const ptsGoldBot = [
                [xOutGold, yBot + 0.012, z],
                [xOutGold, yBot - 0.018, z]
            ];

            if (side < 0) {
                ptsCream.reverse();
                ptsGoldTop.reverse();
                ptsGoldBot.reverse();
            }
            creamSections.push(ptsCream);
            goldTopSections.push(ptsGoldTop);
            goldBotSections.push(ptsGoldBot);
        }

        group.add(new THREE.Mesh(createLoftedGeometry(creamSections, false, false, false, 0.8), mats.creamStripe));
        group.add(new THREE.Mesh(createLoftedGeometry(goldTopSections, false, false, false, 0.8), mats.goldStripe));
        group.add(new THREE.Mesh(createLoftedGeometry(goldBotSections, false, false, false, 0.8), mats.goldStripe));

        // Prolongamento da Saia Inferior Cromada (de Z = zEnd = 2.33m até o encontro com a curva traseira dos paralamas dianteiros)
        const ySkirtBot = CHASSIS_Y_TOP;          // 0.89m
        const ySkirtTop = CHASSIS_Y_TOP + 0.11;   // 1.00m
        const zFenderRearBot = 2.555;             // Encontro exato com o cilindro do paralama em Y = 0.89m
        const zFenderRearTop = 2.620;             // Encontro exato com o cilindro do paralama em Y = 1.00m
        const hoodSkirtSections = [];
        const hoodSkirtSteps = 4;
        for (let i = 0; i <= hoodSkirtSteps; i++) {
            const u = i / hoodSkirtSteps;
            const zB = THREE.MathUtils.lerp(zEnd, zFenderRearBot, u);
            const zT = THREE.MathUtils.lerp(zEnd, zFenderRearTop, u);
            const wB = getHoodSectionParams(zB).wFlank;
            const wT = getHoodSectionParams(zT).wFlank;
            const xInB = side * (wB - 0.005);
            const xOutB = side * (wB + 0.011);
            const xInT = side * (wT - 0.005);
            const xOutT = side * (wT + 0.011);
            const pts = [
                [xInB, ySkirtBot, zB],
                [xInT, ySkirtTop, zT],
                [xOutT, ySkirtTop, zT],
                [xOutB, ySkirtBot, zB]
            ];
            if (side > 0) pts.reverse();
            hoodSkirtSections.push(pts);
        }
        group.add(new THREE.Mesh(createLoftedGeometry(hoodSkirtSections, true, true, true, 0.4), mats.chrome));
    });

    return group;
}

// ============================================================================
// 5. PARA-LAMAS DIANTEIROS W900L (CILINDRO DEITADO SECCIONADO COM FURO NA BASE)
// ============================================================================

const DEFAULT_FENDER_PARAMS = {
    posX: Number((0.7675 * CAB_WIDTH_SCALE).toFixed(4)),          // Posição X do centro do cilindro (~0.8740m) -> borda externa em ±1.190m (largura total = 2.38m)
    posY: 0.56,            // Posição Y (altura do eixo do cilindro) (m)
    posZ: 3.21,            // Posição Z (alinhado ao eixo dianteiro) (m)
    cylinderRadius: 0.745, // Raio externo do cilindro (m)
    holeRadius: 0.56,      // Raio do furo central da base (m)
    cylinderLength: Number((0.555 * CAB_WIDTH_SCALE).toFixed(4)), // Comprimento do cilindro no eixo X (~0.6320m) (de ±0.558m a ±1.190m -> 2.38m total)
    frontCutY: 0.20,       // Altura da secção horizontal frontal (relativa ao eixo do cilindro) (m)
    rearCutY: -0.08,       // Altura da secção horizontal traseira (relativa ao eixo do cilindro) (m)
    showAccessories: true  // Mostrar bloco de faróis e lameiro
};

function buildSculptedFrontFenders(mats, p = DEFAULT_FENDER_PARAMS, accessoriesOnly = false, includeHeadlights = true) {
    const group = new THREE.Group();

    const R = Math.max(0.20, p.cylinderRadius);
    const r = Math.min(R - 0.015, Math.max(0.10, p.holeRadius));
    const L = Math.max(0.05, p.cylinderLength);

    // Alturas de corte horizontal frontal e traseira (limitadas ao raio para manter corte horizontal válido)
    const yCutFront = THREE.MathUtils.clamp(p.frontCutY, -R + 0.01, R - 0.02);
    const yCutRear = THREE.MathUtils.clamp(p.rearCutY, -R + 0.01, R - 0.02);

    // Ângulos onde o plano horizontal frontal (y = yCutFront) e traseiro (y = yCutRear) cortam o cilindro externo (R) e o furo (r)
    const thetaOutFront = Math.asin(THREE.MathUtils.clamp(yCutFront / R, -0.995, 0.995));
    const thetaOutRear = Math.PI - Math.asin(THREE.MathUtils.clamp(yCutRear / R, -0.995, 0.995));

    const thetaInFront = Math.asin(THREE.MathUtils.clamp(yCutFront / r, -0.995, 0.995));
    const thetaInRear = Math.PI - Math.asin(THREE.MathUtils.clamp(yCutRear / r, -0.995, 0.995));

    const totalSteps = 44;
    const filletSteps = 7;
    const rFillet = Math.min(0.064, (R - r) * 0.42, L * 0.18);
    const shellThick = 0.016; // Espessura da borda externa pintada do paralama (1.6 cm)
    const radInnerTop = R - shellThick;
    const radInnerLip = Math.max(r + 0.02, (R - rFillet) - 0.006);

    const thetaInnerTopFront = Math.asin(THREE.MathUtils.clamp(yCutFront / radInnerTop, -0.995, 0.995));
    const thetaInnerTopRear = Math.PI - Math.asin(THREE.MathUtils.clamp(yCutRear / radInnerTop, -0.995, 0.995));
    const thetaInnerLipFront = Math.asin(THREE.MathUtils.clamp(yCutFront / radInnerLip, -0.995, 0.995));
    const thetaInnerLipRear = Math.PI - Math.asin(THREE.MathUtils.clamp(yCutRear / radInnerLip, -0.995, 0.995));

    const smoothstep01 = (e0, e1, val) => {
        const t = THREE.MathUtils.clamp((val - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
    };

    [-1, 1].forEach(side => {
        if (!accessoriesOnly) {
            const outerFenderSections = [];
            const innerLinerSections = [];
            const xIn = side * (p.posX - L / 2);
            const xOut = side * (p.posX + L / 2);
            const xShoulderIn = side * (p.posX + L / 2 - rFillet);
            const xOutLip = side * (p.posX + L / 2 - shellThick);

            for (let i = 0; i <= totalSteps; i++) {
                const s = i / totalSteps;
                const tOut = THREE.MathUtils.lerp(thetaOutFront, thetaOutRear, s);
                const tIn = THREE.MathUtils.lerp(thetaInFront, thetaInRear, s);
                const tInnerTop = THREE.MathUtils.lerp(thetaInnerTopFront, thetaInnerTopRear, s);
                const tInnerLip = THREE.MathUtils.lerp(thetaInnerLipFront, thetaInnerLipRear, s);

                const zOut = p.posZ + Math.cos(tOut) * R;
                const yOut = p.posY + Math.sin(tOut) * R;

                const zOutInner = p.posZ + Math.cos(tInnerTop) * radInnerTop;
                const yOutInner = p.posY + Math.sin(tInnerTop) * radInnerTop;

                const zLipInner = p.posZ + Math.cos(tInnerLip) * radInnerLip;
                const yLipInner = p.posY + Math.sin(tInnerLip) * radInnerLip;

                const zIn = p.posZ + Math.cos(tIn) * r;
                const yIn = p.posY + Math.sin(tIn) * r;

                // 1. Casca externa pintada (mats.paint) com ombro externo arredondado em arco contínuo de 1/4 de círculo
                //    suavizando a quina entre a face curvada superior e a face lateral externa vertical
                const outerPts = [
                    [xIn, yOutInner, zOutInner],
                    [xIn, yOut, zOut]
                ];
                for (let k = 0; k <= filletSteps; k++) {
                    const alpha = (k / filletSteps) * (Math.PI / 2);
                    const xArc = side * (p.posX + L / 2 - rFillet + Math.sin(alpha) * rFillet);
                    const radArc = (R - rFillet) + Math.cos(alpha) * rFillet;
                    const tArcFront = Math.asin(THREE.MathUtils.clamp(yCutFront / radArc, -0.995, 0.995));
                    const tArcRear = Math.PI - Math.asin(THREE.MathUtils.clamp(yCutRear / radArc, -0.995, 0.995));
                    const tArc = THREE.MathUtils.lerp(tArcFront, tArcRear, s);
                    const yArc = p.posY + Math.sin(tArc) * radArc;
                    const zArc = p.posZ + Math.cos(tArc) * radArc;
                    outerPts.push([xArc, yArc, zArc]);
                }
                outerPts.push(
                    [xOut, yIn, zIn],
                    [xOutLip, yIn, zIn],
                    [xOutLip, yLipInner, zLipInner],
                    [xShoulderIn, yOutInner, zOutInner]
                );

                // 2. Forro interno sombreado da caixa de roda (mats.wheelWellLiner):
                //    recobre todo o arco cilíndrico interno de raio r acompanhando a folga interna sob o ombro arredondado
                const xInLiner = side * 0.44;
                const linerPts = [
                    [xInLiner, yIn, zIn],
                    [xInLiner, yOutInner - 0.001, zOutInner],
                    [xShoulderIn, yOutInner - 0.001, zOutInner],
                    [xOutLip - side * 0.001, yLipInner - 0.001, zLipInner],
                    [xOutLip - side * 0.001, yIn, zIn]
                ];

                if (side < 0) {
                    outerPts.reverse();
                    linerPts.reverse();
                }
                outerFenderSections.push(outerPts);
                innerLinerSections.push(linerPts);
            }

            // capStart = true e capEnd = true fecham exatamente os planos horizontais de corte frontal e traseiro!
            const outerFenderGeo = createLoftedGeometry(outerFenderSections, true, true, true, 0.72);
            group.add(new THREE.Mesh(outerFenderGeo, mats.paint));

            const innerLinerGeo = createLoftedGeometry(innerLinerSections, true, true, true, 0.65);
            group.add(new THREE.Mesh(innerLinerGeo, mats.wheelWellLiner));

            // 2b. Filete côncavo contínuo (Cove Fillet) suavizando a junção entre a face curvada do paralama e a parede lateral do capô
            const fenderHoodCoveSections = [];
            const coveStations = 38;
            const coveArcSteps = 6;
            const zCoveStart = Math.min(HOOD_Z_START - 0.006, p.posZ + Math.sqrt(Math.max(0.01, R * R - yCutFront * yCutFront)) - 0.02);
            const zCoveEnd = 2.618;

            for (let i = 0; i <= coveStations; i++) {
                const u = i / coveStations;
                const z = THREE.MathUtils.lerp(zCoveStart, zCoveEnd, u);
                const dz = z - p.posZ;
                if (Math.abs(dz) >= R - 0.005) continue;

                const sinOut = Math.sqrt(Math.max(0.01, R * R - dz * dz)) / R;
                const yF = p.posY + sinOut * R;
                const axWall = getHoodSectionParams(z).wFlank;

                const rearTaper = smoothstep01(2.616, 2.71, z);
                const frontTaper = smoothstep01(zCoveStart + 0.002, 3.820, z);
                const rCoveX = 0.006 + 0.032 * rearTaper * (0.45 + 0.55 * frontTaper);
                const rCoveY = rCoveX / Math.max(0.68, sinOut);

                const covePts = [];
                covePts.push([side * (axWall + 0.0002), yF + rCoveY + 0.005, z]);
                for (let k = 0; k <= coveArcSteps; k++) {
                    const alpha = (k / coveArcSteps) * (Math.PI / 2);
                    const ax = axWall + 0.00025 + rCoveX * (1 - Math.cos(alpha));
                    const yy = yF + 0.00025 + rCoveY * (1 - Math.sin(alpha));
                    covePts.push([side * ax, yy, z]);
                }
                covePts.push([side * (axWall + 0.00025 + rCoveX + 0.006), yF + 0.0002, z]);

                if (side < 0) covePts.reverse();
                fenderHoodCoveSections.push(covePts);
            }
            if (fenderHoodCoveSections.length >= 2) {
                group.add(new THREE.Mesh(createLoftedGeometry(fenderHoodCoveSections, false, false, false, 0.78), mats.paint));
            }

            // 3. Fechamento interno escuro (Splash Shield / Apron) na parte interna/traseira da caixa de roda:
            //    bloqueia a passagem de luz e a visão do chão claro entre o chassi, o capô e o lameiro atrás do pneu
            const zRearCut = p.posZ - Math.sqrt(Math.max(0.01, R * R - yCutRear * yCutRear));
            const yRearAbs = p.posY + yCutRear;
            const xChassisOuter = side * 0.382;
            const xSplash = side * (p.posX - L / 2 + 0.004);

            // Painel longitudinal interno fechando de Y = 0.34m até Y = 0.89m na traseira da caixa de roda (fora do envelope de esterçamento do pneu)
            const splashSideSections = [
                [
                    [xChassisOuter, 0.34, zRearCut + 0.035],
                    [xChassisOuter, 0.89, zRearCut + 0.035],
                    [xSplash, 0.89, zRearCut + 0.035],
                    [xSplash, 0.34, zRearCut + 0.035]
                ],
                [
                    [xChassisOuter, 0.48, p.posZ - r + 0.02],
                    [xChassisOuter, 0.89, p.posZ - r + 0.02],
                    [xSplash, 0.89, p.posZ - r + 0.02],
                    [xSplash, 0.48, p.posZ - r + 0.02]
                ]
            ];
            if (side > 0) {
                splashSideSections[0].reverse();
                splashSideSections[1].reverse();
            }
            group.add(new THREE.Mesh(createLoftedGeometry(splashSideSections, true, true, true, 0.3), mats.wheelWellLiner));

            // Aba interna estendendo o lameiro até a longarina do chassi sob a base traseira do paralama (Y = 0.30m a Y = yRearAbs)
            const innerFlapExtW = Math.abs(xSplash - xChassisOuter) + 0.04;
            const innerFlapExtH = yRearAbs - 0.30;
            const innerFlapExt = new THREE.Mesh(new THREE.BoxGeometry(innerFlapExtW, innerFlapExtH, 0.016), mats.wheelWellLiner);
            innerFlapExt.position.set((xSplash + xChassisOuter) / 2, 0.30 + innerFlapExtH / 2, zRearCut + 0.038);
            group.add(innerFlapExt);
        }

        if (p.showAccessories) {
            const fScale = (p.posX + L / 2) / 1.045;
            // Posição da borda traseira e frontal para acompanhar o cilindro seccionado
            const zRearCut = p.posZ - Math.sqrt(Math.max(0.01, R * R - yCutRear * yCutRear));
            const yRearAbs = p.posY + yCutRear;

            // Lameiro dianteiro de borracha preta (Front Fender Mudflap) sob a secção horizontal traseira
            const flapW = Math.min(0.52 * fScale, L * 0.9);
            const flapH = 0.22;
            const flap = new THREE.Mesh(new THREE.BoxGeometry(flapW, flapH, 0.018), mats.rubber);
            flap.position.set(side * p.posX, yRearAbs - flapH / 2 + 0.02, zRearCut + 0.04);
            group.add(flap);

            const flapWeight = new THREE.Mesh(new THREE.BoxGeometry(flapW - 0.04 * fScale, 0.045, 0.024), mats.chrome);
            flapWeight.position.set(side * p.posX, yRearAbs - flapH + 0.04, zRearCut + 0.04);
            group.add(flapWeight);

            // Luz Indicadora de Direção (Seta) Quase Quadrada no Topo do Para-lama (Fender-Top Turn Signal)
            const sigW = 0.114 * fScale; // Largura X da lente proporcional à largura do paralama
            const sigH = 0.104; // Altura Y da lente (~10.4 cm)
            const sigD = 0.068; // Profundidade Z (~6.8 cm)
            const sigTotalW = sigW + 0.005 * fScale; // Largura total considerando o aro cromado

            // Extremidade mais externa da seta posicionada horizontalmente proporcionalmente da extremidade mais externa do para-lama
            const fenderOuterAbsX = p.posX + L / 2;
            const sigX = side * (fenderOuterAbsX - 0.06 * fScale - sigTotalW / 2);
            const sigZ = p.posZ + 0.02;
            const dzSig = sigZ - p.posZ;
            const yFenderTop = p.posY + Math.sqrt(Math.max(0.01, R * R - dzSig * dzSig));

            // Base/suporte cromada e junta de borracha com 80% da largura da lente
            const sigBaseW = sigW * 0.80;
            const sigBaseD = sigD * 0.85;
            const sigGasket = new THREE.Mesh(new RoundedBoxGeometry(sigBaseW - 0.002, 0.014, sigBaseD - 0.002, 2, 0.004), mats.rubber);
            sigGasket.position.set(sigX, yFenderTop - 0.001, sigZ);
            group.add(sigGasket);

            const sigPedestal = new THREE.Mesh(new RoundedBoxGeometry(sigBaseW, 0.018, sigBaseD, 2, 0.005), mats.chrome);
            sigPedestal.position.set(sigX, yFenderTop + 0.013, sigZ);
            group.add(sigPedestal);

            // Corpo principal da lente âmbar quase quadrada (dupla face frontal/traseira com textura de lente apagada)
            const sigCenterY = yFenderTop + 0.022 + sigH / 2;
            const sigLensGeo = new RoundedBoxGeometry(sigW, sigH, sigD, 3, 0.014);
            const slPos = sigLensGeo.attributes.position;
            const slUv = sigLensGeo.attributes.uv;
            for (let vi = 0; vi < slPos.count; vi++) {
                slUv.setXY(
                    vi,
                    THREE.MathUtils.clamp(0.5 + slPos.getX(vi) / sigW, 0, 1),
                    THREE.MathUtils.clamp(0.5 + slPos.getY(vi) / sigH, 0, 1)
                );
            }
            slUv.needsUpdate = true;
            const sigLens = new THREE.Mesh(sigLensGeo, mats.amberLight);
            sigLens.position.set(sigX, sigCenterY, sigZ);
            group.add(sigLens);

            // Friso/aro cromado central envolvendo as bordas laterais e superior entre as faces frontal e traseira
            const sigCenterBand = new THREE.Mesh(new RoundedBoxGeometry(sigTotalW, sigH + 0.004, 0.016, 2, 0.012), mats.chrome);
            sigCenterBand.position.set(sigX, sigCenterY, sigZ);
            group.add(sigCenterBand);
        }
    });

    if (p.showAccessories && includeHeadlights) {
        const { podsGroup, lampsGroup } = buildFrontHeadlightsAndPods(mats, p);
        group.add(podsGroup);
        group.add(lampsGroup);
    }

    return group;
}

function buildFrontHeadlightsAndPods(
    mats,
    p = DEFAULT_FENDER_PARAMS,
    podParams = DEFAULT_CABIN_ELEMENTS_PARAMS.caixaFarois
) {
    const podsGroup = new THREE.Group();
    const lampsGroup = new THREE.Group();

    const R = Math.max(0.20, p.cylinderRadius);
    const L = Math.max(0.05, p.cylinderLength);
    const fScale = (p.posX + L / 2) / 1.045;

    const defBox = DEFAULT_CABIN_ELEMENTS_PARAMS.caixaFarois;
    const boxCfg = podParams || defBox;

    // Fatores de escala da caixa vermelha de suporte dos faróis (aplicados simetricamente a cada lado)
    const sx = Math.max(0.05, boxCfg.dimX / defBox.dimX);
    const sy = Math.max(0.05, boxCfg.dimY / defBox.dimY);
    const sz = Math.max(0.05, boxCfg.dimZ / defBox.dimZ);

    // Deslocamentos de posição da caixa de suporte (os faróis mantêm suas dimensões fixas e acompanham a posição)
    const deltaX = boxCfg.posX - defBox.posX;
    const deltaY = boxCfg.posY - defBox.posY;

    // Posição longitudinal base harmonizada com o paralama:
    //  - Frente em Z=3.825m com bordas frontais arredondadas em 3D (rFront = 1.0 cm).
    //  - Traseira estendida até Z=3.420m com concordância Hermite C1/C2 (sem degrau/desnível) tangente ao arco do paralama.
    const zPodRearBase = 3.420;
    const zPodFrontBase = 3.825;
    const zPodFrontTrans = boxCfg.posZ + (zPodFrontBase - defBox.posZ) * sz;
    const deltaZFront = zPodFrontTrans - zPodFrontBase;

    // Dimensões e posições fixas dos dois faróis e da divisória central ("moldura que separa os dois faróis"):
    //  - Posição X padrão ajustada para posX = 0.78 (-0.027m em relação a 0.807) e larguraMoldura padrão = 0.02m.
    //  - Alterar `larguraMoldura` expande/contrai APENAS o contorno externo da moldura, sem mover os faróis
    //    e sem variar a divisória central `centerDivW`.
    const defaultRimBorder = 0.0125;
    const defaultBezelW = 0.324 * fScale;
    const defaultBezelH = 0.132;
    const bezelOuterX = 0.914 * fScale - 0.027;  // Alinhada à posição padrão posX = 0.78 da caixa
    const baseLampAbsX = bezelOuterX - defaultBezelW * 0.5;
    const baseLampY = 1.070;                     // Acompanhando a altura frontal Y=1.150m da caixa
    const baseBezelBackZ = 3.817;                // Acompanhando a face frontal Z=3.825m

    const centerDivW = 0.010 * fScale;           // Divisória central fixa entre os dois faróis (invariante)
    const openW = (defaultBezelW - 2 * defaultRimBorder - centerDivW) * 0.5; // Largura fixa de cada farol
    const openH = defaultBezelH - 2 * defaultRimBorder;                      // Altura fixa de cada farol
    const lampOffsetX = centerDivW * 0.5 + openW * 0.5;                      // Posição relativa fixa de cada farol

    const rimBorder = Math.max(0.002, boxCfg.larguraMoldura ?? defBox.larguraMoldura ?? 0.020);
    const bezelW = 2 * openW + centerDivW + 2 * rimBorder;
    const bezelH = openH + 2 * rimBorder;

    const podY = baseLampY + deltaY;
    const bezelBackZ = baseBezelBackZ + deltaZFront;

    // Constrói moldura cromada 3D vazada com cantos arredondados e duas janelas retangulares internas
    const addRoundedRectPath = (target, cx, cy, w, h, r, clockwise = false) => {
        const hw = w * 0.5;
        const hh = h * 0.5;
        const cr = Math.min(r, hw * 0.48, hh * 0.48);
        if (!clockwise) {
            target.moveTo(cx - hw + cr, cy - hh);
            target.lineTo(cx + hw - cr, cy - hh);
            target.absarc(cx + hw - cr, cy - hh + cr, cr, -Math.PI / 2, 0, false);
            target.lineTo(cx + hw, cy + hh - cr);
            target.absarc(cx + hw - cr, cy + hh - cr, cr, 0, Math.PI / 2, false);
            target.lineTo(cx - hw + cr, cy + hh);
            target.absarc(cx - hw + cr, cy + hh - cr, cr, Math.PI / 2, Math.PI, false);
            target.lineTo(cx - hw, cy - hh + cr);
            target.absarc(cx - hw + cr, cy - hh + cr, cr, Math.PI, Math.PI * 1.5, false);
        } else {
            target.moveTo(cx - hw + cr, cy - hh);
            target.absarc(cx - hw + cr, cy - hh + cr, cr, Math.PI * 1.5, Math.PI, true);
            target.lineTo(cx - hw, cy + hh - cr);
            target.absarc(cx - hw + cr, cy + hh - cr, cr, Math.PI, Math.PI / 2, true);
            target.lineTo(cx + hw - cr, cy + hh);
            target.absarc(cx + hw - cr, cy + hh - cr, cr, Math.PI / 2, 0, true);
            target.lineTo(cx + hw, cy - hh + cr);
            target.absarc(cx + hw - cr, cy - hh + cr, cr, 0, -Math.PI / 2, true);
            target.closePath();
        }
    };

    const bevS = Math.min(0.0035, rimBorder * 0.28, centerDivW * 0.31);
    const rimFlat = Math.max(0.0008, rimBorder - 2 * bevS);
    const outerCornerR = 0.006 + Math.min(rimFlat, 0.008) * (0.010 / 0.0055) + Math.max(0, rimFlat - 0.008);

    const smoothstep01 = (e0, e1, val) => {
        const t = THREE.MathUtils.clamp((val - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const yFenderExact = (zVal) => {
        const dz = zVal - p.posZ;
        return p.posY + Math.sqrt(Math.max(0.0001, R * R - dz * dz));
    };
    const yFenderSlope = (zVal) => {
        const dz = zVal - p.posZ;
        const rad = Math.sqrt(Math.max(0.0001, R * R - dz * dz));
        return -dz / rad;
    };

    // Parâmetros geométricos em espaço global (ancorados diretamente à superfície real do capô e do paralama
    // mesmo quando `posX`, `posY`, `posZ` ou `dimX/Y/Z` são ajustados no painel):
    const baseAxOut = 0.928 * fScale - 0.027; // Parede externa paralela ao eixo Z na posição posX = 0.78 (~1.030m)
    const axOut = Math.max(0.68, baseAxOut + deltaX + (sx - 1) * 0.236);
    const yFrontTop = 1.150 + deltaY + (sy - 1) * 0.14;
    const zPodFront = zPodFrontTrans;
    const zPodRear = zPodFront - (zPodFrontBase - zPodRearBase) * sz;
    const zBlendFront = THREE.MathUtils.lerp(zPodRear, zPodFront, (3.730 - 3.420) / (3.825 - 3.420));

    const rTopOut = 0.025;             // Raio convexo da quina longitudinal superior-externa (2.5 cm)
    const rFront = Math.min(0.010, (zPodFront - zPodRear) * 0.15); // Raio 3D das quinas frontais (1.0 cm)
    const rBaseFront = 0.013;          // Raio côncavo frontal-inferior sob a moldura cromada de 0.02m (1.3 cm)
    const zBodyEnd = zPodFront - rFront;
    const flatTopSlope = -0.051 / 0.220;

    // Concordância Hermite cúbica C1/C2 estritamente monotônica entre o plano frontal e a superfície cilíndrica do paralama:
    //  - Em z = zPodRear: altura H = 0.00mm e derivada dH/dz = 0.000 (0.00° de diferença angular com o paralama — zero desnível!).
    //  - Em z = zBlendFront..zPodFront: face superior plana contínua com inclinação `flatTopSlope`.
    const yFlatAt = (zVal) => yFrontTop + flatTopSlope * (zVal - zPodFront);
    const blendLen = Math.max(0.04, zBlendFront - zPodRear);
    const H1 = Math.max(0.004, yFlatAt(zBlendFront) - yFenderExact(zBlendFront));
    const M1 = Math.max(0.004, blendLen * (flatTopSlope - yFenderSlope(zBlendFront)));
    const hermC2 = 3 * H1 - M1;
    const hermC3 = M1 - 2 * H1;

    const podHeightAboveFender = (zVal) => {
        if (zVal <= zPodRear) return 0;
        if (zVal >= zBlendFront) return Math.max(0, yFlatAt(zVal) - yFenderExact(zVal));
        const u = (zVal - zPodRear) / blendLen;
        return Math.max(0, hermC2 * u * u + hermC3 * u * u * u);
    };
    const podTopProfile = (zVal) => yFenderExact(zVal) + 0.00018 + podHeightAboveFender(zVal);

    [-1, 1].forEach(side => {
        // 1. Carena / Caixa Vermelha Integrada em Fibra de Vidro (mats.paint) fundida harmoniosamente ao Capô e ao Paralama:
        //    As 4 sub-superfícies compartilham vértices idênticos na fronteira z = zBodyEnd e são soldadas antes do cálculo de normais.
        const hoodArcSteps = 6;
        const cornerSteps = 6;
        const baseSteps = 4;
        const noseSteps = 5;
        const rHoodFrontStart = 0.026;

        // 1a. Corpo principal unificado (zPodRear -> zBodyEnd):
        //     filete côncavo no capô + topo plano com curva Hermite até o paralama + curva em S externa (ombro convexo R1 -> parede Z -> base côncava R2)
        const bodySteps = 28;
        const bodySections = [];
        for (let i = 0; i <= bodySteps; i++) {
            const z = THREE.MathUtils.lerp(zPodRear, zBodyEnd, i / bodySteps);
            const dz = z - p.posZ;
            const sinOut = Math.sqrt(Math.max(0.01, R * R - dz * dz)) / R;
            const axHood = getHoodSectionParams(z).wFlank;
            const yF = yFenderExact(z);
            const H = podHeightAboveFender(z);
            const yTop = yF + 0.00018 + H;

            const tFront = smoothstep01(zPodFront - 0.165, zBodyEnd, z);
            const rHoodX = THREE.MathUtils.lerp(0.038, rHoodFrontStart, tFront);
            const rHoodY = THREE.MathUtils.lerp(0.038 / Math.max(0.68, sinOut), rHoodFrontStart, tFront);
            const R2 = THREE.MathUtils.lerp(0.024, rBaseFront, smoothstep01(zPodFront - 0.145, zBodyEnd, z));

            const thetaMax = (H >= rTopOut + R2)
                ? (Math.PI / 2)
                : Math.acos(THREE.MathUtils.clamp(1 - H / (rTopOut + R2), -1, 1));

            const pts = [];
            // Aba tangente na parede lateral do capô (5 mm)
            pts.push([side * (axHood + 0.00025), yTop + rHoodY + 0.005, z]);
            // Filete côncavo contínuo Capô <-> Topo da Caixa
            for (let k = 0; k <= hoodArcSteps; k++) {
                const alpha = (k / hoodArcSteps) * (Math.PI / 2);
                const ax = axHood + 0.00025 + rHoodX * (1 - Math.cos(alpha));
                const yy = yTop + rHoodY * (1 - Math.sin(alpha));
                pts.push([side * ax, yy, z]);
            }
            // Ombro superior-externo convexo (0 -> thetaMax; achata suavemente a 0° quando H -> 0 sobre o paralama)
            for (let k = 0; k <= cornerSteps; k++) {
                const ang = (k / cornerSteps) * thetaMax;
                const axC = axOut - rTopOut * Math.sin(thetaMax) + rTopOut * Math.sin(ang);
                const yC = (yTop - rTopOut) + rTopOut * Math.cos(ang);
                pts.push([side * axC, yC, z]);
            }
            // Parede lateral externa vertical paralela ao eixo Z (colapsa suavemente no ponto de inflexão quando H <= R1 + R2)
            const yWallBot = (H >= rTopOut + R2)
                ? (yF + 0.00018 + R2)
                : ((yTop - rTopOut) + rTopOut * Math.cos(thetaMax));
            pts.push([side * axOut, yWallBot, z]);
            // Concordância inferior-externa côncava (thetaMax -> 0°) pousando tangente sobre o cilindro do paralama
            for (let k = 1; k <= baseSteps; k++) {
                const ang = (1 - k / baseSteps) * thetaMax;
                const axB = axOut + R2 * Math.sin(thetaMax) - R2 * Math.sin(ang);
                const yB = (yF + 0.00018 + R2) - R2 * Math.cos(ang);
                pts.push([side * axB, yB, z]);
            }
            // Aba tangente sobre a superfície do paralama (5 mm)
            pts.push([side * (axOut + R2 * Math.sin(thetaMax) + 0.005), yF + 0.00015, z]);

            if (side > 0) pts.reverse();
            bodySections.push(pts);
        }
        const geoBody = createLoftedGeometry(bodySections, false, false, false, 0.78);

        // 1b. Nariz frontal 3D arredondado e assento plano frontal (zBodyEnd -> zPodFront)
        const yTopBodyEnd = podTopProfile(zBodyEnd);
        const noseSections = [];
        for (let m = 0; m <= noseSteps; m++) {
            const beta = (m / noseSteps) * (Math.PI / 2);
            const z = zBodyEnd + Math.sin(beta) * rFront;
            const inset = rFront * (1 - Math.cos(beta));
            const axHood = getHoodSectionParams(z).wFlank;
            const axIn = axHood - 0.008;
            const yF = yFenderExact(z);
            const yTopCur = yTopBodyEnd - inset;
            const axOutCur = axOut - inset;
            const rCorner = Math.max(0.006, rTopOut - inset);
            const yPodBot = yF - 0.025;
            const yWallBot = yF + 0.00018 + rBaseFront;

            const ring = [
                [side * axIn, yPodBot, z],
                [side * axIn, yTopCur, z],
                [side * (axHood + 0.00025 + rHoodFrontStart), yTopCur, z]
            ];
            for (let k = 0; k <= cornerSteps; k++) {
                const ang = (k / cornerSteps) * (Math.PI / 2);
                const axC = (axOutCur - rCorner) + Math.sin(ang) * rCorner;
                const yC = (yTopCur - rCorner) + Math.cos(ang) * rCorner;
                ring.push([side * axC, yC, z]);
            }
            ring.push([side * axOutCur, yWallBot, z]);
            ring.push([side * axOutCur, yPodBot, z]);

            if (side > 0) ring.reverse();
            noseSections.push(ring);
        }
        const geoNose = createLoftedGeometry(noseSections, true, false, true, 0.78);

        // 1c. Continuação frontal do filete côncavo com o Capô (contorna a quina frontal-superior, desce a face frontal-interna e pousa no paralama)
        const frontHoodPath = [];
        for (let m = 0; m <= noseSteps; m++) {
            const beta = (m / noseSteps) * (Math.PI / 2);
            frontHoodPath.push({
                z: zBodyEnd + Math.sin(beta) * rFront,
                y: (yTopBodyEnd - rFront) + Math.cos(beta) * rFront,
                ny: Math.cos(beta),
                nz: Math.sin(beta),
                rC: THREE.MathUtils.lerp(rHoodFrontStart, 0.018, m / noseSteps)
            });
        }
        const yFrontTopPad = yTopBodyEnd - rFront;
        const yFrontBotStart = yFenderExact(zPodFront) + 0.00018 + rBaseFront;
        for (let m = 1; m <= 6; m++) {
            frontHoodPath.push({
                z: zPodFront,
                y: THREE.MathUtils.lerp(yFrontTopPad, yFrontBotStart, m / 6),
                ny: 0,
                nz: 1,
                rC: 0.018
            });
        }
        for (let m = 1; m <= 4; m++) {
            const gamma = (m / 4) * (Math.PI / 2);
            const zFl = zPodFront + rBaseFront * (1 - Math.cos(gamma));
            const yFl = yFenderExact(zFl) + 0.00018 + rBaseFront * (1 - Math.sin(gamma));
            frontHoodPath.push({ z: zFl, y: yFl, ny: Math.sin(gamma), nz: Math.cos(gamma), rC: 0.018 });
        }

        const frontHoodSections = [];
        for (let idx = 0; idx < frontHoodPath.length; idx++) {
            const { z, y, ny, nz, rC } = frontHoodPath[idx];
            const pts = [];
            const zF0 = z + (rC + 0.005) * nz;
            const yF0 = y + (rC + 0.005) * ny;
            pts.push([side * (getHoodSectionParams(zF0).wFlank + 0.00025), yF0, zF0]);
            for (let k = 0; k <= hoodArcSteps; k++) {
                const alpha = (k / hoodArcSteps) * (Math.PI / 2);
                const offN = 0.00022 * nz + rC * (1 - Math.sin(alpha));
                const offX = 0.00025 + rC * (1 - Math.cos(alpha));
                const zk = z + offN * nz;
                const yk = y + (rC * (1 - Math.sin(alpha))) * ny;
                pts.push([side * (getHoodSectionParams(zk).wFlank + offX), yk, zk]);
            }
            if (side > 0) pts.reverse();
            frontHoodSections.push(pts);
        }
        const geoFrontHood = createLoftedGeometry(frontHoodSections, false, false, false, 0.78);

        // 1d. Continuação frontal do filete côncavo da base sobre o Paralama (contorna o canto frontal-externo e a base sob a moldura cromada)
        const frontBasePath = [];
        for (let m = 0; m <= 5; m++) {
            const phi = (m / 5) * (Math.PI / 2);
            frontBasePath.push({
                axW: (axOut - rFront) + Math.cos(phi) * rFront,
                zB: zBodyEnd + Math.sin(phi) * rFront,
                nx: Math.cos(phi),
                nz: Math.sin(phi)
            });
        }
        const axFrontStart = axOut - rFront;
        const axFrontEnd = getHoodSectionParams(zPodFront).wFlank - 0.002;
        for (let m = 1; m <= 10; m++) {
            frontBasePath.push({
                axW: THREE.MathUtils.lerp(axFrontStart, axFrontEnd, m / 10),
                zB: zPodFront,
                nx: 0,
                nz: 1
            });
        }

        const frontBaseSections = [];
        for (let idx = 0; idx < frontBasePath.length; idx++) {
            const { axW, zB, nx, nz } = frontBasePath[idx];
            const pts = [];
            for (let k = 0; k <= baseSteps; k++) {
                const alpha = (k / baseSteps) * (Math.PI / 2);
                const offH = 0.00022 * nz + rBaseFront * (1 - Math.cos(alpha));
                const offY = 0.00018 + rBaseFront * (1 - Math.sin(alpha));
                const zk = zB + offH * nz;
                const yk = yFenderExact(zk) + offY;
                pts.push([side * (axW + (rBaseFront * (1 - Math.cos(alpha))) * nx), yk, zk]);
            }
            const offHF = rBaseFront + 0.005;
            const zFOut = zB + offHF * nz;
            pts.push([side * (axW + offHF * nx), yFenderExact(zFOut) + 0.00015, zFOut]);

            if (side > 0) pts.reverse();
            frontBaseSections.push(pts);
        }
        const geoFrontBase = createLoftedGeometry(frontBaseSections, false, false, false, 0.78);

        const mergedPodGeo = BufferGeometryUtils.mergeGeometries([geoBody, geoNose, geoFrontHood, geoFrontBase], false);
        [geoBody, geoNose, geoFrontHood, geoFrontBase].forEach(g => g.dispose());
        computeCreasedNormals(mergedPodGeo, 0.78);
        podsGroup.add(new THREE.Mesh(mergedPodGeo, mats.paint));

        // 2. Moldura Cromada Vazada de Cantos Arredondados e Faróis Retangulares Duplos W900L
        //    (acompanham as mudanças de posição da caixa de suporte; `larguraMoldura` varia apenas a borda externa):
        const podX = side * (baseLampAbsX + deltaX);

        const bezelShape = new THREE.Shape();
        addRoundedRectPath(bezelShape, 0, 0, bezelW - 2 * bevS, bezelH - 2 * bevS, outerCornerR, false);

        [-lampOffsetX, lampOffsetX].forEach(dx => {
            const hole = new THREE.Path();
            addRoundedRectPath(hole, dx, 0, openW + 2 * bevS, openH + 2 * bevS, 0.006, true);
            bezelShape.holes.push(hole);
        });

        const chromeBezelGeo = new THREE.ExtrudeGeometry(bezelShape, {
            steps: 1,
            depth: 0.022,
            bevelEnabled: true,
            bevelThickness: 0.0045,
            bevelSize: bevS,
            bevelSegments: 3,
            curveSegments: 10
        });
        const chromeBezel = new THREE.Mesh(chromeBezelGeo, mats.chrome);
        chromeBezel.position.set(podX, podY, bezelBackZ);
        lampsGroup.add(chromeBezel);

        // Fundo cromado/metálico atrás das duas aberturas + lentes cristalinas embutidas dentro da moldura
        const backInset = Math.min(0.012, rimBorder * 0.96);
        const backingPlate = new THREE.Mesh(
            new THREE.BoxGeometry(bezelW - backInset, bezelH - backInset, 0.008),
            mats.polishedAluminum
        );
        backingPlate.position.set(podX, podY, bezelBackZ + 0.004);
        lampsGroup.add(backingPlate);

        // 4 pequenos parafusos cromados nos cantos da moldura (acompanham a largura da borda externa)
        const screwR = Math.min(0.0032, rimBorder * 0.256);
        const screwInset = rimBorder * 0.64;
        if (screwR >= 0.0008) {
            const cornerScrewGeo = new THREE.CylinderGeometry(screwR, screwR, 0.006, 8);
            cornerScrewGeo.rotateX(Math.PI / 2);
            [-bezelW * 0.5 + screwInset, bezelW * 0.5 - screwInset].forEach(sxOff => {
                [-bezelH * 0.5 + screwInset, bezelH * 0.5 - screwInset].forEach(syOff => {
                    const screw = new THREE.Mesh(cornerScrewGeo, mats.chrome);
                    screw.position.set(podX + sxOff, podY + syOff, bezelBackZ + 0.025);
                    lampsGroup.add(screw);
                });
            });
        }

        const rimPad = Math.min(0.002, rimBorder * 0.8);
        [-lampOffsetX, lampOffsetX].forEach(dx => {
            // Farol externo (mesmo sinal de `side`) acende nas luzes de posição; farol interno acende nos faróis principais
            const isOuterLamp = Math.sign(dx) === side;

            // Aro interno prateado da câmara refletora
            const lampReflectorRim = new THREE.Mesh(
                new THREE.BoxGeometry(openW + rimPad, openH + rimPad, 0.012),
                mats.polishedAluminum
            );
            lampReflectorRim.position.set(podX + dx, podY, bezelBackZ + 0.011);
            lampsGroup.add(lampReflectorRim);

            // Lente retangular cristalina recuada ~7mm dentro da moldura cromada
            const lampLens = new THREE.Mesh(
                new THREE.BoxGeometry(openW - 0.003, openH - 0.003, 0.014),
                isOuterLamp ? (mats.outerHeadlightLens || mats.headlightLens) : mats.headlightLens
            );
            lampLens.position.set(podX + dx, podY, bezelBackZ + 0.014);
            lampsGroup.add(lampLens);
        });
    });

    return { podsGroup, lampsGroup };
}

const DEFAULT_CABIN_ELEMENTS_PARAMS = {
    chassi: {
        posX: 0.00,   // Posição lateral X do centro (m)
        posY: 0.67,   // Posição vertical Y da base inferior do chassi ao solo (m) (CHASSIS_FRAME_Y_BOT = 0.67m)
        posZ: -0.0525,// Posição longitudinal Z do centro (entre Z=-3.955m e Z=+3.850m)
        dimX: 0.78,   // Largura externa X das longarinas do chassi (m)
        dimY: 0.33,   // Altura vertical Y das longarinas do chassi (m) (CHASSIS_HEIGHT = 0.33m, topo em Y=1.00m)
        dimZ: 7.805   // Comprimento longitudinal total Z do chassi (m) (de Z=-3.955m até Z=+3.850m; total do caminhão = 7.90m até o para-choque em +3.945m)
    },
    capo: {
        posX: 0.00,   // Posição lateral X do centro (m)
        posY: 0.76,   // Posição vertical Y da base (encostando no topo do para-choque = 0.76m)
        posZ: 3.095,  // Posição longitudinal Z do centro (entre Z=3.86m e Z=2.33m)
        dimX: 1.116,  // Largura frontal X (m) proporcional a 2.38m (0.98 * 2.38 / 2.09 ≈ 1.116m)
        dimY: 1.23,   // Altura total Y (m) (1.10m acima do topo do chassi + 0.13m descendo até o para-choque)
        dimZ: 1.53    // Comprimento longitudinal Z (m) (de Z=3.86m até Z=2.33m)
    },
    nucleo: {
        posX: 0.00,    // Posição lateral X do centro (m)
        posY: 0.89,    // Posição vertical Y da base (topo do chassi = 0.89m)
        posZ: 1.68,    // Posição longitudinal Z do centro (entre Z=2.33m e Z=1.03m)
        dimX: 1.86,    // Largura traseira X do núcleo (m) (1.86m -> ±0.93m)
        dimYMin: 1.81, // Altura Y da parte mais baixa do núcleo acima do topo do chassi (m) (frente do teto, junto ao para-brisa)
        dimYMax: 1.98, // Altura Y da parte mais alta do núcleo acima do topo do chassi (m) (traseira do teto, onde encontra o sleeper)
        dimZ: 1.30     // Comprimento longitudinal total Z (m) (1.12m visíveis no centro)
    },
    sleeper: {
        posX: 0.00,   // Posição lateral X do centro (m)
        posY: 0.89,   // Posição vertical Y da base (topo do chassi = 0.89m)
        posZ: 0.19,   // Posição longitudinal Z do centro (entre Z=1.21m e Z=-0.83m)
        dimX: 2.38,   // Largura total X (m) (±1.190m)
        dimY: 2.46,   // Altura Y acima do topo do chassi (m) (topo em Y=3.35m)
        dimZ: 2.04    // Comprimento longitudinal central Z (m) (de Z=1.21m até Z=-0.83m)
    },
    quintaRoda: {
        posX: 0.00,       // Posição lateral X do centro da quinta roda (m)
        posY: 1.00,       // Posição vertical Y da placa base sobre o chassi (m) (CHASSIS_FRAME_Y_TOP = 1.00m)
        posZ: -2.835,     // Posição longitudinal Z do centro da quinta roda (m)
        alturaBase: 0.125 // Altura vertical Y da base/pedestal da quinta roda destacada em rosa (m)
    },
    caixaFarois: {
        posX: 0.780,          // Posição lateral |X| ajustada para 0.78m (parede externa em ~1.030m, conectada internamente ao capô)
        posY: 0.955,          // Posição vertical Y da base inferior ao solo (m) (topo frontal em Y=1.150m)
        posZ: 3.6225,         // Posição longitudinal Z do centro da caixa harmonizada com o paralama (m) (entre Z=3.420m e Z=3.825m)
        dimX: 0.473,          // Largura horizontal X de cada caixa de suporte (m)
        dimY: 0.300,          // Altura vertical Y total da caixa de suporte integrada ao paralama e ao capô (m)
        dimZ: 0.405,          // Comprimento longitudinal Z total da caixa até a concordância tangente com o paralama (m) (de Z=3.420m até Z=3.825m)
        larguraMoldura: 0.020 // Largura da borda externa da moldura cromada dos faróis ajustada para 0.02m
    },
    chapaPassadico: {
        posX: 0.00,       // Posição lateral X do centro da chapa do passadiço (m)
        posY: 1.00,       // Posição vertical Y da base da chapa sobre o chassi (m) (CHASSIS_FRAME_Y_TOP = 1.00m)
        posZ: -0.975,     // Posição longitudinal Z do centro da chapa do passadiço (m)
        dimX: 0.76,       // Largura lateral X da chapa do passadiço (m)
        dimY: 0.025,      // Espessura/altura vertical Y da chapa do passadiço (m)
        dimZ: 0.70        // Comprimento longitudinal Z da chapa do passadiço (m)
    },
    janelaMotorista: {
        posX: 0.855,  // Posição lateral X do centro da janela na parede cônica (m) (getNucleoWidthAtLocalZ(1.595) ≈ 0.855m)
        posY: 1.99,   // Posição vertical Y da base da janela (1.10m acima do topo do chassi = 1.99m)
        posZ: 1.595,  // Posição longitudinal Z do centro da janela (extremidade frontal recuada em 3cm)
        dimX: 0.022,  // Dimensão/espessura lateral X da janela (m)
        dimY: 0.48,   // Altura vertical Y da janela (de 1.10m até 1.58m acima do chassi = 0.48m)
        dimZ: 0.83    // Comprimento longitudinal médio Z da janela (m) (reduzido em 3cm movendo a frente para trás)
    },
    filtroArEsquerdo: {
        posX: 0.933,  // Posição lateral X do centro do filtro de ar do lado esquerdo (m) (0.795 + 0.1384m acompanhando a parede do cone em Z=2.35m)
        posY: 1.60,   // Posição vertical Y do centro do filtro de ar (m)
        posZ: 2.35,   // Posição longitudinal Z do centro do filtro de ar (m)
        dimX: 0.33,   // Dimensão/diâmetro lateral X do filtro de ar (m) (2 * 0.165m)
        dimY: 0.78,   // Altura vertical Y do cilindro do filtro de ar (m)
        dimZ: 0.33    // Dimensão/diâmetro longitudinal Z do filtro de ar (m) (2 * 0.165m)
    },
    janelaSuperiorSleeper: {
        posX: 1.190,  // Posição lateral X das janelas superiores laterais na parede do sleeper (m) (±1.190m)
        posY: 2.965,  // Posição vertical Y da base das janelas superiores laterais (m)
        posZ: 0.117,  // Posição longitudinal Z do centro da base (mantém frente em 0.605m e alinha traseira em -0.37m)
        dimX: 0.009,  // Espessura/projeção lateral X das janelas superiores laterais (m)
        dimY: 0.255,  // Altura vertical Y das janelas superiores laterais (m)
        dimZ: 0.975   // Comprimento longitudinal Z da base (estendido para alinhar a extremidade traseira com a janela vertical)
    },
    chapaTuboFiltroAr: {
        posX: 0.828,  // Posição lateral X do centro da chapa cromada do tubo do filtro de ar (m) (0.690 + 0.1384m acompanhando o filtro de ar)
        posY: 1.640,  // Posição vertical Y do centro da chapa cromada (m)
        posZ: 2.545,  // Posição longitudinal Z do centro da chapa cromada (m)
        dimX: 0.270,  // Tamanho X (largura lateral da chapa cromada) (m)
        dimY: 0.365,  // Tamanho Y (altura vertical da chapa cromada) (m)
        dimZ: 0.215,  // Tamanho Z (comprimento longitudinal da chapa cromada) (m)
        rotX: 0.0,    // Rotação no eixo X (Pitch em graus)
        rotY: 11.0,   // Rotação no eixo Y (Yaw simétrico em graus)
        rotZ: 0.0     // Rotação no eixo Z (Roll simétrico em graus)
    }
};

function applySingleCabinPartTransform(targetGroup, cur, def) {
    const sx = Math.max(0.05, cur.dimX / def.dimX);
    const sy = (cur.dimY !== undefined && def.dimY) ? Math.max(0.05, cur.dimY / def.dimY) : 1.0;
    const sz = Math.max(0.05, cur.dimZ / def.dimZ);

    const refX = def.posX;
    const refYBaked = def.posY - 0.76; // Coordenada Y local no grupo já com offset -0.76
    const refZ = def.posZ;

    targetGroup.scale.set(sx, sy, sz);
    targetGroup.position.set(
        (cur.posX - refX) + refX * (1 - sx),
        (cur.posY - def.posY) + refYBaked * (1 - sy),
        (cur.posZ - refZ) + refZ * (1 - sz)
    );
}

function mountStructureVisibilityUI({
    othersGroup,
    bakedFenderShell,
    bakedHood,
    bakedNucleo,
    bakedSleeper,
    bakedChassis,
    wheelMeshes,
    bakedCatwalkPlate,
    bakedRearTaillights,
    rebuildHeadlights,
    rebuildNucleo,
    initialEngineVariant = 4,
    onSelectEngineVariant = null
}) {
    if (typeof document === 'undefined') return null;
    const existing = document.getElementById('structure-visibility-panel');
    if (existing) existing.remove();
    if (typeof window !== 'undefined' && window._toggleStructureVisibilityPanel) {
        window.removeEventListener('keydown', window._toggleStructureVisibilityPanel, true);
        window._toggleStructureVisibilityPanel = null;
    }

    const cabinParams = {
        chassi: { ...DEFAULT_CABIN_ELEMENTS_PARAMS.chassi },
        caixaFarois: { ...DEFAULT_CABIN_ELEMENTS_PARAMS.caixaFarois },
        chapaPassadico: { ...DEFAULT_CABIN_ELEMENTS_PARAMS.chapaPassadico },
        capo: { ...DEFAULT_CABIN_ELEMENTS_PARAMS.capo },
        nucleo: { ...DEFAULT_CABIN_ELEMENTS_PARAMS.nucleo },
        sleeper: { ...DEFAULT_CABIN_ELEMENTS_PARAMS.sleeper }
    };

    const updateCabinTransforms = (changedPartId) => {
        if ((changedPartId === 'nucleo' || changedPartId === 'all') && typeof rebuildNucleo === 'function') {
            rebuildNucleo(DEFAULT_CABIN_ELEMENTS_PARAMS.janelaMotorista, cabinParams.nucleo);
        }
        if ((changedPartId === 'caixaFarois' || changedPartId === 'all') && typeof rebuildHeadlights === 'function') {
            rebuildHeadlights(cabinParams.caixaFarois);
        }
        if (bakedCatwalkPlate) {
            applySingleCabinPartTransform(bakedCatwalkPlate, cabinParams.chapaPassadico, DEFAULT_CABIN_ELEMENTS_PARAMS.chapaPassadico);
        }
        applySingleCabinPartTransform(bakedChassis, cabinParams.chassi, DEFAULT_CABIN_ELEMENTS_PARAMS.chassi);
        if (bakedRearTaillights) {
            const curC = cabinParams.chassi;
            const defC = DEFAULT_CABIN_ELEMENTS_PARAMS.chassi;
            const sx = Math.max(0.05, curC.dimX / defC.dimX);
            const sy = Math.max(0.05, curC.dimY / defC.dimY);
            const refX = defC.posX;
            const defCenterY = defC.posY + defC.dimY * 0.5;
            const curCenterY = curC.posY + curC.dimY * 0.5;
            const refYBaked = defCenterY - 0.76;
            const defRearZ = defC.posZ - defC.dimZ * 0.5;
            const curRearZ = curC.posZ - curC.dimZ * 0.5;

            bakedRearTaillights.scale.set(sx, sy, 1.0);
            bakedRearTaillights.position.set(
                (curC.posX - refX) + refX * (1 - sx),
                (curCenterY - defCenterY) + refYBaked * (1 - sy),
                curRearZ - defRearZ
            );
        }
        applySingleCabinPartTransform(bakedHood, cabinParams.capo, DEFAULT_CABIN_ELEMENTS_PARAMS.capo);
        applySingleCabinPartTransform(bakedNucleo, cabinParams.nucleo, DEFAULT_CABIN_ELEMENTS_PARAMS.nucleo);
        applySingleCabinPartTransform(bakedSleeper, cabinParams.sleeper, DEFAULT_CABIN_ELEMENTS_PARAMS.sleeper);
    };

    const panel = document.createElement('div');
    panel.id = 'structure-visibility-panel';
    Object.assign(panel.style, {
        position: 'fixed',
        top: '80px',
        left: '16px',
        width: '340px',
        maxHeight: 'calc(100vh - 96px)',
        backgroundColor: 'rgba(15, 18, 24, 0.92)',
        color: '#f3f4f6',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        padding: '10px 12px',
        zIndex: '9999',
        display: 'none',
        flexDirection: 'column',
        gap: '8px',
        overflowY: 'auto',
        userSelect: 'none'
    });

    ['mousedown', 'mousemove', 'mouseup', 'wheel', 'pointerdown', 'pointermove', 'keydown', 'keyup'].forEach(evt => {
        panel.addEventListener(evt, e => e.stopPropagation());
    });

    // Seletor das 5 variantes de som do motor (padrão = #4: Grave + rouco)
    const soundSection = document.createElement('div');
    Object.assign(soundSection.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.14)'
    });

    const soundHeader = document.createElement('div');
    soundHeader.textContent = '🔊 Som do Motor';
    Object.assign(soundHeader.style, {
        fontWeight: '700',
        fontSize: '12px',
        color: '#f9fafb'
    });
    soundSection.appendChild(soundHeader);

    const soundBtnGrid = document.createElement('div');
    Object.assign(soundBtnGrid.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '5px'
    });

    const engineOptions = [
        { id: 1, label: '1: Cat 3406B' },
        { id: 2, label: '2: Mais rouco' },
        { id: 3, label: '3: Mais grave' },
        { id: 4, label: '4: Grave + rouco' },
        { id: 5, label: '5: Vídeo (N14)' }
    ];
    const soundButtons = new Map();
    let activeEngineId = Number.isInteger(initialEngineVariant) && initialEngineVariant >= 1 && initialEngineVariant <= 5
        ? initialEngineVariant
        : 4;

    const refreshSoundButtons = () => {
        soundButtons.forEach((btn, id) => {
            const isActive = id === activeEngineId;
            btn.style.backgroundColor = isActive ? '#ffd600' : '#1f2937';
            btn.style.color = isActive ? '#111827' : '#e5e7eb';
            btn.style.borderColor = isActive ? '#fef08a' : 'rgba(255, 255, 255, 0.24)';
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    engineOptions.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.setAttribute('data-engine-variant', String(opt.id));
        Object.assign(btn.style, {
            padding: '5px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            fontWeight: '700',
            fontSize: '11px',
            cursor: 'pointer',
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'background-color 0.12s ease, color 0.12s ease'
        });
        if (opt.id === 5) {
            btn.style.gridColumn = 'span 2';
            btn.style.textAlign = 'center';
        }

        let lastTouchTs = 0;
        const onPickSound = (e) => {
            if (e.type === 'touchstart') {
                lastTouchTs = Date.now();
                if (e.cancelable) e.preventDefault();
            } else if (e.type === 'click' && Date.now() - lastTouchTs < 500) {
                return;
            }
            e.stopPropagation();
            let chosen = opt.id;
            if (typeof onSelectEngineVariant === 'function') {
                const res = onSelectEngineVariant(opt.id);
                if (Number.isInteger(res) && res >= 1 && res <= 5) {
                    chosen = res;
                }
            }
            activeEngineId = chosen;
            refreshSoundButtons();
            btn.blur();
        };

        btn.addEventListener('touchstart', onPickSound, { passive: false });
        btn.addEventListener('click', onPickSound);
        soundButtons.set(opt.id, btn);
        soundBtnGrid.appendChild(btn);
    });

    refreshSoundButtons();
    soundSection.appendChild(soundBtnGrid);
    panel.appendChild(soundSection);

    const toggleOthersBtn = document.createElement('button');
    Object.assign(toggleOthersBtn.style, {
        padding: '8px 14px',
        borderRadius: '8px',
        border: 'none',
        fontWeight: '700',
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease'
    });

    const updateBtnState = () => {
        if (othersGroup.visible) {
            toggleOthersBtn.textContent = '👁️ Esconder "Outros" (Focar na Estrutura)';
            toggleOthersBtn.style.backgroundColor = '#2563eb';
            toggleOthersBtn.style.color = '#ffffff';
        } else {
            toggleOthersBtn.textContent = '🔧 Mostrando Estrutura (Mostrar "Outros")';
            toggleOthersBtn.style.backgroundColor = '#16a34a';
            toggleOthersBtn.style.color = '#ffffff';
        }
    };

    toggleOthersBtn.addEventListener('click', () => {
        othersGroup.visible = !othersGroup.visible;
        updateBtnState();
    });

    updateBtnState();
    panel.appendChild(toggleOthersBtn);

    // Checkboxes para as 4 partes da Cabine (Paralamas, Capô, Núcleo, Sleeper) + Chassi
    const subRow = document.createElement('div');
    Object.assign(subRow.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        fontSize: '11px',
        color: '#d1d5db',
        paddingTop: '2px',
        paddingBottom: '6px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.14)'
    });

    const makeSubToggle = (label, targetGroup) => {
        const lbl = document.createElement('label');
        Object.assign(lbl.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer'
        });
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = targetGroup.visible;
        chk.addEventListener('change', () => {
            targetGroup.visible = chk.checked;
        });
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(label));
        return lbl;
    };

    subRow.appendChild(makeSubToggle('Paralamas', bakedFenderShell));
    subRow.appendChild(makeSubToggle('Capô', bakedHood));
    subRow.appendChild(makeSubToggle('Núcleo', bakedNucleo));
    subRow.appendChild(makeSubToggle('Sleeper', bakedSleeper));
    subRow.appendChild(makeSubToggle('Chassi', bakedChassis));
    if (Array.isArray(wheelMeshes)) {
        const lbl = document.createElement('label');
        Object.assign(lbl.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer'
        });
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = true;
        chk.addEventListener('change', () => {
            wheelMeshes.forEach(m => {
                if (m) m.visible = chk.checked;
            });
        });
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode('Rodas/Pneus'));
        subRow.appendChild(lbl);
    }
    panel.appendChild(subRow);

    // ========================================================================
    // CONTROLES DE POSIÇÃO (X, Y, Z) E DIMENSÕES (X, Y, Z) DE CAPÔ, NÚCLEO E SLEEPER
    // ========================================================================
    const tunerHeader = document.createElement('div');
    Object.assign(tunerHeader.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontWeight: '700',
        fontSize: '12px',
        color: '#f9fafb',
        paddingTop: '2px'
    });
    const tunerTitle = document.createElement('span');
    tunerTitle.textContent = '📐 Dimensões e Posição da Cabine';
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '—';
    Object.assign(collapseBtn.style, {
        background: 'rgba(255,255,255,0.14)',
        border: 'none',
        color: '#fff',
        borderRadius: '5px',
        width: '22px',
        height: '20px',
        cursor: 'pointer',
        fontWeight: 'bold',
        lineHeight: '18px'
    });
    tunerHeader.appendChild(tunerTitle);
    tunerHeader.appendChild(collapseBtn);
    panel.appendChild(tunerHeader);

    const tunerBody = document.createElement('div');
    Object.assign(tunerBody.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    });

    let isCollapsed = false;
    collapseBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        tunerBody.style.display = isCollapsed ? 'none' : 'flex';
        collapseBtn.textContent = isCollapsed ? '+' : '—';
    });

    // Abas para alternar entre Chassi, Caixa dos Faróis, Chapa, Capô, Núcleo, Sleeper ou Todos
    const tabBar = document.createElement('div');
    Object.assign(tabBar.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px'
    });

    const partDefs = [
        {
            id: 'chassi',
            title: 'Chassi',
            sliders: [
                { key: 'posX', label: 'Posição X (Lateral)', min: -1.00, max: 1.00, step: 0.005 },
                { key: 'posY', label: 'Posição Y (Base ao Solo)', min: 0.10, max: 1.50, step: 0.005 },
                { key: 'posZ', label: 'Posição Z (Centro Long.)', min: -2.00, max: 2.00, step: 0.005 },
                { key: 'dimX', label: 'Dimensão X (Largura)', min: 0.30, max: 2.20, step: 0.005 },
                { key: 'dimY', label: 'Dimensão Y (Altura)', min: 0.10, max: 1.20, step: 0.005 },
                { key: 'dimZ', label: 'Dimensão Z (Comprimento)', min: 3.00, max: 11.00, step: 0.005 }
            ]
        },
        {
            id: 'caixaFarois',
            title: 'Caixa de Suporte dos Faróis',
            sliders: [
                { key: 'larguraMoldura', label: 'Largura da Moldura Cromada', min: 0.002, max: 0.045, step: 0.0005 },
                { key: 'posX', label: 'Posição X (Centro Lateral |X|)', min: 0.350, max: 1.250, step: 0.001 },
                { key: 'posY', label: 'Posição Y (Base ao Solo)', min: 0.500, max: 1.400, step: 0.001 },
                { key: 'posZ', label: 'Posição Z (Centro Long.)', min: 3.200, max: 4.100, step: 0.001 },
                { key: 'dimX', label: 'Dimensão X (Largura)', min: 0.150, max: 0.900, step: 0.001 },
                { key: 'dimY', label: 'Dimensão Y (Altura)', min: 0.080, max: 0.650, step: 0.001 },
                { key: 'dimZ', label: 'Dimensão Z (Comprimento)', min: 0.050, max: 0.700, step: 0.001 }
            ]
        },
        {
            id: 'chapaPassadico',
            title: 'Chapa do Passadiço',
            sliders: [
                { key: 'posX', label: 'Posição X (Lateral)', min: -1.00, max: 1.00, step: 0.005 },
                { key: 'posY', label: 'Posição Y (Base no Chassi)', min: 0.30, max: 1.80, step: 0.005 },
                { key: 'posZ', label: 'Posição Z (Centro Long.)', min: -3.50, max: 0.50, step: 0.005 },
                { key: 'dimX', label: 'Dimensão X (Largura)', min: 0.20, max: 2.40, step: 0.005 },
                { key: 'dimY', label: 'Dimensão Y (Espessura/Alt.)', min: 0.005, max: 0.30, step: 0.005 },
                { key: 'dimZ', label: 'Dimensão Z (Comprimento)', min: 0.20, max: 3.50, step: 0.005 }
            ]
        },
        {
            id: 'capo',
            title: 'Capô',
            sliders: [
                { key: 'posX', label: 'Posição X (Lateral)', min: -1.00, max: 1.00, step: 0.005 },
                { key: 'posY', label: 'Posição Y (Base no Para-choque)', min: 0.20, max: 1.80, step: 0.005 },
                { key: 'posZ', label: 'Posição Z (Centro Long.)', min: 1.50, max: 4.50, step: 0.005 },
                { key: 'dimX', label: 'Dimensão X (Larg. Frontal)', min: 0.40, max: 2.20, step: 0.005 },
                { key: 'dimY', label: 'Dimensão Y (Alt. Total / 1.10 s/ Chassi)', min: 0.40, max: 2.20, step: 0.005 },
                { key: 'dimZ', label: 'Dimensão Z (Comprimento)', min: 0.50, max: 3.00, step: 0.005 }
            ]
        },
        {
            id: 'nucleo',
            title: 'Núcleo',
            sliders: [
                { key: 'posX', label: 'Posição X (Lateral)', min: -1.00, max: 1.00, step: 0.005 },
                { key: 'posY', label: 'Posição Y (Base no Chassi)', min: 0.20, max: 1.80, step: 0.005 },
                { key: 'posZ', label: 'Posição Z (Centro Long.)', min: 0.20, max: 3.20, step: 0.005 },
                { key: 'dimX', label: 'Dimensão X (Larg. Traseira)', min: 0.60, max: 2.50, step: 0.005 },
                { key: 'dimYMin', label: 'Altura Parte Mais Baixa (s/ Chassi)', min: 1.20, max: 2.80, step: 0.005 },
                { key: 'dimYMax', label: 'Altura Parte Mais Alta (s/ Chassi)', min: 1.20, max: 3.00, step: 0.005 },
                { key: 'dimZ', label: 'Dimensão Z (Comprimento Total)', min: 0.50, max: 2.60, step: 0.005 }
            ]
        },
        {
            id: 'sleeper',
            title: 'Sleeper',
            sliders: [
                { key: 'posX', label: 'Posição X (Lateral)', min: -1.00, max: 1.00, step: 0.005 },
                { key: 'posY', label: 'Posição Y (Base no Chassi)', min: 0.20, max: 1.80, step: 0.005 },
                { key: 'posZ', label: 'Posição Z (Centro Long.)', min: -1.50, max: 2.00, step: 0.005 },
                { key: 'dimX', label: 'Dimensão X (Largura)', min: 1.00, max: 3.00, step: 0.005 },
                { key: 'dimY', label: 'Dimensão Y (Altura s/ Chassi)', min: 1.00, max: 3.60, step: 0.005 },
                { key: 'dimZ', label: 'Dimensão Z (Comprimento)', min: 0.60, max: 3.20, step: 0.005 }
            ]
        }
    ];

    const sectionContainers = {};
    const controlRefs = { chassi: {}, caixaFarois: {}, chapaPassadico: {}, capo: {}, nucleo: {}, sleeper: {} };
    let activeTab = 'caixaFarois';

    const tabButtons = {};
    const setTab = (tabId) => {
        activeTab = tabId;
        ['chassi', 'caixaFarois', 'chapaPassadico', 'capo', 'nucleo', 'sleeper', 'todos'].forEach(id => {
            const btn = tabButtons[id];
            if (!btn) return;
            const isSelected = id === activeTab;
            btn.style.backgroundColor = isSelected ? '#ef4444' : 'rgba(255,255,255,0.1)';
            btn.style.color = isSelected ? '#ffffff' : '#d1d5db';
        });
        partDefs.forEach(p => {
            sectionContainers[p.id].style.display = (activeTab === 'todos' || activeTab === p.id) ? 'flex' : 'none';
        });
    };

    [
        { id: 'chassi', label: 'Chassi' },
        { id: 'caixaFarois', label: 'Cx. Faróis' },
        { id: 'chapaPassadico', label: 'Chapa' },
        { id: 'capo', label: 'Capô' },
        { id: 'nucleo', label: 'Núcleo' },
        { id: 'sleeper', label: 'Sleeper' },
        { id: 'todos', label: 'Todos' }
    ].forEach(t => {
        const btn = document.createElement('button');
        btn.textContent = t.label;
        Object.assign(btn.style, {
            flex: '1',
            padding: '5px 4px',
            borderRadius: '6px',
            border: 'none',
            fontWeight: '600',
            fontSize: '11px',
            cursor: 'pointer'
        });
        btn.addEventListener('click', () => setTab(t.id));
        tabButtons[t.id] = btn;
        tabBar.appendChild(btn);
    });
    tunerBody.appendChild(tabBar);

    const jsonArea = document.createElement('textarea');
    jsonArea.readOnly = true;
    jsonArea.rows = 3;
    Object.assign(jsonArea.style, {
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.45)',
        color: '#93c5fd',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '6px',
        padding: '4px 6px',
        fontFamily: 'monospace',
        fontSize: '10px',
        resize: 'none'
    });

    const updateOutputBox = () => {
        const formatted = {};
        for (const partId of ['chassi', 'caixaFarois', 'chapaPassadico', 'capo', 'nucleo', 'sleeper']) {
            formatted[partId] = {};
            for (const [k, v] of Object.entries(cabinParams[partId])) {
                formatted[partId][k] = Number(v.toFixed(4));
            }
        }
        jsonArea.value = JSON.stringify(formatted);
    };

    partDefs.forEach(part => {
        const sec = document.createElement('div');
        Object.assign(sec.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            padding: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
        });

        const secTitle = document.createElement('div');
        secTitle.textContent = `🔹 ${part.title}`;
        Object.assign(secTitle.style, {
            fontWeight: '700',
            fontSize: '11px',
            color: '#fca5a5'
        });
        sec.appendChild(secTitle);

        part.sliders.forEach(cfg => {
            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            });

            const topRow = document.createElement('div');
            Object.assign(topRow.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            });

            const lbl = document.createElement('label');
            lbl.textContent = cfg.label;
            lbl.style.color = '#d1d5db';
            lbl.style.fontSize = '11px';

            const numInput = document.createElement('input');
            numInput.type = 'number';
            numInput.min = cfg.min;
            numInput.max = cfg.max;
            numInput.step = cfg.step;
            numInput.value = cabinParams[part.id][cfg.key];
            Object.assign(numInput.style, {
                width: '66px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                padding: '2px 5px',
                fontSize: '11px',
                textAlign: 'right'
            });

            const rangeInput = document.createElement('input');
            rangeInput.type = 'range';
            rangeInput.min = cfg.min;
            rangeInput.max = cfg.max;
            rangeInput.step = cfg.step;
            rangeInput.value = cabinParams[part.id][cfg.key];
            Object.assign(rangeInput.style, {
                width: '100%',
                accentColor: '#ef4444',
                cursor: 'pointer',
                margin: '0'
            });

            const syncVal = (val) => {
                const parsed = parseFloat(val);
                if (Number.isNaN(parsed)) return;
                cabinParams[part.id][cfg.key] = parsed;
                rangeInput.value = parsed;
                numInput.value = parsed;
                updateCabinTransforms(part.id);
                updateOutputBox();
            };

            rangeInput.addEventListener('input', e => syncVal(e.target.value));
            numInput.addEventListener('input', e => syncVal(e.target.value));

            controlRefs[part.id][cfg.key] = { rangeInput, numInput };

            topRow.appendChild(lbl);
            topRow.appendChild(numInput);
            row.appendChild(topRow);
            row.appendChild(rangeInput);
            sec.appendChild(row);
        });

        sectionContainers[part.id] = sec;
        tunerBody.appendChild(sec);
    });

    tunerBody.appendChild(jsonArea);

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
        display: 'flex',
        gap: '8px'
    });

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copiar Valores';
    Object.assign(copyBtn.style, {
        flex: '1',
        padding: '6px 8px',
        backgroundColor: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontWeight: '600',
        cursor: 'pointer'
    });
    copyBtn.addEventListener('click', () => {
        updateOutputBox();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonArea.value);
        }
        jsonArea.select();
        const prev = copyBtn.textContent;
        copyBtn.textContent = '✅ Copiado!';
        setTimeout(() => { copyBtn.textContent = prev; }, 1500);
    });

    const resetBtn = document.createElement('button');
    resetBtn.textContent = '↺ Resetar';
    Object.assign(resetBtn.style, {
        padding: '6px 10px',
        backgroundColor: 'rgba(255,255,255,0.14)',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontWeight: '600',
        cursor: 'pointer'
    });
    resetBtn.addEventListener('click', () => {
        partDefs.forEach(part => {
            Object.assign(cabinParams[part.id], DEFAULT_CABIN_ELEMENTS_PARAMS[part.id]);
            part.sliders.forEach(cfg => {
                const val = cabinParams[part.id][cfg.key];
                controlRefs[part.id][cfg.key].rangeInput.value = val;
                controlRefs[part.id][cfg.key].numInput.value = val;
            });
        });
        updateCabinTransforms('all');
        updateOutputBox();
    });

    btnRow.appendChild(copyBtn);
    btnRow.appendChild(resetBtn);
    tunerBody.appendChild(btnRow);

    setTab('caixaFarois');
    updateOutputBox();
    panel.appendChild(tunerBody);
    document.body.appendChild(panel);

    if (typeof window !== 'undefined') {
        const onToggleKey = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                e.stopPropagation();
                const isHidden = panel.style.display === 'none';
                panel.style.display = isHidden ? 'flex' : 'none';
                if (!isHidden && document.activeElement && panel.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
            }
        };
        window._toggleStructureVisibilityPanel = onToggleKey;
        window.addEventListener('keydown', onToggleKey, true);
    }

    return {
        setActiveEngineVariant(id) {
            if (Number.isInteger(id) && id >= 1 && id <= 5) {
                activeEngineId = id;
                refreshSoundButtons();
            }
        }
    };
}

// ============================================================================
// 6. NÚCLEO DA CABINE (FORMATO CÔNICO CONTÍNUO COM O CAPÔ) + INTERIOR 3D
// ============================================================================

const NUCLEO_WINDSHIELD_Y_TOP = CHASSIS_Y_TOP + NUCLEO_WINDOW_TOP_HEIGHT; // 0.89 + 1.58 = 2.47m (ponto mais alto das janelas do núcleo)
const NUCLEO_ROOF_Y_FRONT = CHASSIS_Y_TOP + NUCLEO_ROOF_MIN_HEIGHT;       // 0.89 + 1.81 = 2.70m (ponto mais baixo do teto do núcleo, junto ao para-brisa)

function getNucleoRoofHeightAtZ(zLocal, xLocal = 0) {
    // A borda frontal em V do teto do núcleo (de Z=2.14m no centro até Z=2.00m nas laterais)
    // fica toda na mesma altura inicial NUCLEO_ROOF_Y_FRONT (2.70m) para encaixar 100% reta no quebra-sol,
    // subindo em linha 100% reta até NUCLEO_Y_TOP (2.93m) no encontro com o sleeper (Z=1.03m), sem quinas intermediárias.
    const wFront = getHoodSectionParams(2.00 + CAB_Z_SHIFT).wFlank;
    const u = THREE.MathUtils.clamp(Math.abs(xLocal) / wFront, 0, 1);
    const zFrontAtX = THREE.MathUtils.lerp(2.14, 2.00, u);
    const t = THREE.MathUtils.clamp((zFrontAtX - zLocal) / (zFrontAtX - NUCLEO_Z_END_LOCAL), 0, 1);
    return THREE.MathUtils.lerp(NUCLEO_ROOF_Y_FRONT, NUCLEO_Y_TOP, t);
}

function getNucleoWidthAtLocalZ(zLocal) {
    return getHoodSectionParams(zLocal + CAB_Z_SHIFT).wFlank;
}

function buildSculptedDayCabAndInterior(
    mats,
    winParams = DEFAULT_CABIN_ELEMENTS_PARAMS.janelaMotorista,
    nucleoParams = DEFAULT_CABIN_ELEMENTS_PARAMS.nucleo
) {
    const group = new THREE.Group();

    const nCfg = nucleoParams || DEFAULT_CABIN_ELEMENTS_PARAMS.nucleo;
    const zCowlFront = NUCLEO_Z_START_LOCAL; // 2.33 (início do núcleo, colado ao fim do capô)
    const zWindBaseCenter = 2.26;            // Base central do para-brisa em V
    const zWindBaseOuter = 2.12;             // Base lateral do para-brisa e da Coluna A
    const zWindTopCenter = zWindBaseCenter - 0.12; // 2.14m (recuo de 0.12m no centro)
    const zWindTopOuter = zWindBaseOuter - 0.12;   // 2.00m (recuo de 0.12m nas laterais)
    const zDoorFront = zWindBaseOuter;       // 2.12m (a parede lateral do núcleo vai até a base da Coluna A)
    const zCabRear = NUCLEO_Z_END_LOCAL;     // 1.03 (fim do núcleo nas laterais; no centro toca o sleeper em Z = 1.21)
    const yCabBottom = CHASSIS_Y_TOP;        // 0.89m (apoiado sobre a parte superior do chassi)
    const yBeltline = HOOD_Y_TOP;            // 1.99m (1.10m acima do chassi, alinhado ao topo constante do capô)
    const yRoofFront = CHASSIS_Y_TOP + (nCfg.dimYMin ?? NUCLEO_ROOF_MIN_HEIGHT); // 2.70m (1.81m acima do chassi na parte mais baixa do teto)
    const yNucleoTop = CHASSIS_Y_TOP + (nCfg.dimYMax ?? NUCLEO_HEIGHT);          // 2.93m (2.04m acima do chassi na parte mais alta do teto, onde encontra o sleeper)
    const yRoofEdge = NUCLEO_WINDSHIELD_Y_TOP; // 2.47m (1.58m acima do chassi: ponto mais alto das janelas)
    const wallT = 0.045;

    const localRoofHeightAtZ = (zLocal, uLateral = 0) => {
        const zFrontAtU = THREE.MathUtils.lerp(2.14, 2.00, THREE.MathUtils.clamp(uLateral, 0, 1));
        const t = THREE.MathUtils.clamp((zFrontAtU - zLocal) / (zFrontAtU - zCabRear), 0, 1);
        return THREE.MathUtils.lerp(yRoofFront, yNucleoTop, t);
    };

    // Parâmetros dinâmicos da janela do motorista (aplicados simetricamente nas duas portas do núcleo)
    const wCfg = winParams || DEFAULT_CABIN_ELEMENTS_PARAMS.janelaMotorista;
    const yWinBot = THREE.MathUtils.clamp(wCfg.posY, yCabBottom + 0.12, yRoofEdge - 0.05);
    const yWinTop = THREE.MathUtils.clamp(wCfg.posY + wCfg.dimY, yWinBot + 0.05, yNucleoTop - 0.02);
    const zWinRear = THREE.MathUtils.clamp(wCfg.posZ - wCfg.dimZ / 2, zCabRear + 0.02, 2.05);
    const zWinFrontMid = THREE.MathUtils.clamp(wCfg.posZ + wCfg.dimZ / 2, zWinRear + 0.08, 2.22);
    const xWinDelta = (wCfg.posX - DEFAULT_CABIN_ELEMENTS_PARAMS.janelaMotorista.posX);
    const winThick = Math.max(0.004, wCfg.dimX);

    // Helper para criar painéis de parede que seguem exatamente a reta cônica (sem degraus e sem curvas)
    const makeConicalWallPanel = (side, zFront, zRear, yBot, yTop, mat, insetOut = 0, thickness = wallT) => {
        const sections = [];
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const z = THREE.MathUtils.lerp(zFront, zRear, i / steps);
            const wCone = getNucleoWidthAtLocalZ(z);
            const wOut = wCone - insetOut;
            const wIn = wOut - thickness;
            const xMin = side < 0 ? -wOut : wIn;
            const xMax = side < 0 ? -wIn : wOut;
            sections.push([
                [xMin, yBot, z],
                [xMin, yTop, z],
                [xMax, yTop, z],
                [xMax, yBot, z]
            ]);
        }
        return new THREE.Mesh(createLoftedGeometry(sections, true, true, true, 0.4), mat);
    };

    // Helper para painéis trapezoidais acompanhando a coluna A inclinada e a parede cônica
    const makeTrapConicalWallPanel = (side, zFBot, zFTop, zRBot, zRTop, yB, yT, mat, insetOut = 0, thickness = wallT) => {
        const sections = [];
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const zB = THREE.MathUtils.lerp(zFBot, zRBot, u);
            const zT = THREE.MathUtils.lerp(zFTop, zRTop, u);
            const wOutB = getNucleoWidthAtLocalZ(zB) - insetOut;
            const wInB = wOutB - thickness;
            const wOutT = getNucleoWidthAtLocalZ(zT) - insetOut;
            const wInT = wOutT - thickness;
            const xMinB = side < 0 ? -wOutB : wInB;
            const xMaxB = side < 0 ? -wInB : wOutB;
            const xMinT = side < 0 ? -wOutT : wInT;
            const xMaxT = side < 0 ? -wInT : wOutT;
            sections.push([
                [xMinB, yB, zB],
                [xMinT, yT, zT],
                [xMaxT, yT, zT],
                [xMaxB, yB, zB]
            ]);
        }
        return new THREE.Mesh(createLoftedGeometry(sections, true, true, true, 0.4), mat);
    };

    // 6.1 Cowl Cônico com Transição Harmônica (de Z = 2.33m no encontro com o Capô até a base do para-brisa em V e Coluna A em Z = 2.12m):
    // Na frente (s = 0, Z = 2.33m), possui exatamente a mesma seção transversal chanfrada do capô;
    // ao avançar até a Coluna A (s = 1, Z = 2.12m nas laterais e Z = 2.26m no centro), o chanfro lateral se abre
    // suavemente até formar a parede vertical plena que encontra a base da Coluna A e a parede lateral da porta.
    const cowlSections = [];
    const cowlSteps = 10;
    for (let i = 0; i <= cowlSteps; i++) {
        const s = i / cowlSteps;
        const blend = s * s * (3 - 2 * s); // Transição suave (smoothstep) de 0 (perfil do capô) a 1 (parede vertical plena na Coluna A)

        const zOuter = THREE.MathUtils.lerp(zCowlFront, zWindBaseOuter, s);
        const zCenter = THREE.MathUtils.lerp(zCowlFront, zWindBaseCenter, s);
        const zAtLateralFrac = (uAbs) => THREE.MathUtils.lerp(zCenter, zOuter, uAbs);

        const wOuter = getHoodSectionParams(zOuter + CAB_Z_SHIFT).wFlank;
        const yTop = yBeltline;

        // O recuo lateral do ombro (0.02m e 0.065m no capô) zera suavemente ao chegar na base da Coluna A (s = 1)
        const dxShoulder = 0.02 * (1 - blend);
        const dxCorner = 0.065 * (1 - blend);

        const yCrease = THREE.MathUtils.lerp(yTop - 0.25, yTop - 0.14, blend);
        const yShoulder = THREE.MathUtils.lerp(yTop - 0.10, yTop - 0.05, blend);
        const yCorner = THREE.MathUtils.lerp(yTop - 0.045, yTop, blend);
        const yMidCrown = THREE.MathUtils.lerp(yTop - 0.01, yTop, blend);

        const xShoulder = wOuter - dxShoulder;
        const xCorner = wOuter - dxCorner;
        const xMid = xCorner * 0.48;

        const zShoulder = zAtLateralFrac(xShoulder / wOuter);
        const zCorner = zAtLateralFrac(xCorner / wOuter);
        const zMid = zAtLateralFrac(xMid / wOuter);

        cowlSections.push([
            [-wOuter, yCabBottom, zOuter],
            [-wOuter, yCrease, zOuter],
            [-xShoulder, yShoulder, zShoulder],
            [-xCorner, yCorner, zCorner],
            [-xMid, yMidCrown, zMid],
            [0, yTop, zCenter],
            [xMid, yMidCrown, zMid],
            [xCorner, yCorner, zCorner],
            [xShoulder, yShoulder, zShoulder],
            [wOuter, yCrease, zOuter],
            [wOuter, yCabBottom, zOuter]
        ]);
    }
    group.add(new THREE.Mesh(createLoftedGeometry(cowlSections, true, true, true, 0.55), mats.paint));

    // 6.2 Piso Trapezoidal e Paredes Inferiores Cônicas das Portas (prolongadas até zDoorFront = 2.12m, na base da Coluna A, e vedadas atrás até zCabRearSeal)
    const zCabRearSeal = zCabRear - 0.055; // 0.975m (entra na frente curva do sleeper em Z=0.987m quando |X|=0.93m, sem fresta)
    const floorSections = [];
    for (let i = 0; i <= 4; i++) {
        const z = THREE.MathUtils.lerp(zDoorFront, zCabRearSeal, i / 4);
        const w = getNucleoWidthAtLocalZ(z) - 0.01;
        floorSections.push([
            [-w, yCabBottom, z],
            [-w, yCabBottom + 0.06, z],
            [w, yCabBottom + 0.06, z],
            [w, yCabBottom, z]
        ]);
    }
    group.add(new THREE.Mesh(createLoftedGeometry(floorSections, true, true, true, 0.4), mats.interiorDark));

    // Parede Esquerda (Motorista - cônica contínua abaixo do "dente" da janela, prolongada até a Coluna A em zDoorFront = 2.12m)
    const yNotchDrop = 0.256; // Profundidade vertical do "dente" frontal da janela Daylite Door (de 1.99m até 1.734m, na linha verde indicada)
    const yLowerWallTop = Math.min(yBeltline - 0.26, yWinBot - yNotchDrop - 0.004); // 1.73m (logo abaixo da base do "dente")
    group.add(makeConicalWallPanel(1, zDoorFront, zCabRearSeal, yCabBottom, yLowerWallTop, mats.paint));

    // Parede Direita (Passageiro - cônica contínua COM a "Peep Window" inferior a 5 cm da moldura frontal e quinas arredondadas com raio de 3 cm)
    const zFrontMoldingInner = (zWindBaseOuter - 0.055 + 0.030) - 0.0075; // Borda interna da moldura cromada frontal (~2.0875m)
    const peepZ2 = zFrontMoldingInner - 0.05; // 5 cm atrás da moldura frontal (~2.0375m)
    const peepZ1 = peepZ2 - 0.38;             // Mantém a largura de 0.38m da peep window (~1.6575m)
    const peepY1 = 1.18, peepY2 = 1.52;

    const peepWinCorners = [
        [peepY2, peepZ1], // 0: Topo-Traseiro
        [peepY1, peepZ1], // 1: Base-Traseiro
        [peepY1, peepZ2], // 2: Base-Frontal
        [peepY2, peepZ2]  // 3: Topo-Frontal
    ];
    const peepOuterCorners = [
        [yLowerWallTop, zCabRearSeal], // 0: Topo-Traseiro externo
        [yCabBottom, zCabRearSeal],    // 1: Base-Traseiro externo
        [yCabBottom, zDoorFront],      // 2: Base-Frontal externo
        [yLowerWallTop, zDoorFront]    // 3: Topo-Frontal externo
    ];

    const rPeepCorner = 0.03; // Raio de 3 cm nas 4 quinas da Peep Window
    const rPeepOuterChamfer = 0.002;
    const peepCornerSteps = 8;
    const peepLoopYZ = [];
    const peepOuterLoopYZ = [];

    for (let c = 0; c < 4; c++) {
        const wPrev = peepWinCorners[(c + 3) % 4];
        const wCurr = peepWinCorners[c];
        const wNext = peepWinCorners[(c + 1) % 4];

        const dyIn = wPrev[0] - wCurr[0], dzIn = wPrev[1] - wCurr[1];
        const lenIn = Math.hypot(dyIn, dzIn) || 1;
        const dyOut = wNext[0] - wCurr[0], dzOut = wNext[1] - wCurr[1];
        const lenOut = Math.hypot(dyOut, dzOut) || 1;

        const dIn = Math.min(rPeepCorner, lenIn * 0.45);
        const dOut = Math.min(rPeepCorner, lenOut * 0.45);

        const wStartY = wCurr[0] + (dyIn / lenIn) * dIn;
        const wStartZ = wCurr[1] + (dzIn / lenIn) * dIn;
        const wEndY = wCurr[0] + (dyOut / lenOut) * dOut;
        const wEndZ = wCurr[1] + (dzOut / lenOut) * dOut;

        const oPrev = peepOuterCorners[(c + 3) % 4];
        const oCurr = peepOuterCorners[c];
        const oNext = peepOuterCorners[(c + 1) % 4];
        const oDyIn = oPrev[0] - oCurr[0], oDzIn = oPrev[1] - oCurr[1];
        const oLenIn = Math.hypot(oDyIn, oDzIn) || 1;
        const oDyOut = oNext[0] - oCurr[0], oDzOut = oNext[1] - oCurr[1];
        const oLenOut = Math.hypot(oDyOut, oDzOut) || 1;

        const oStartY = oCurr[0] + (oDyIn / oLenIn) * rPeepOuterChamfer;
        const oStartZ = oCurr[1] + (oDzIn / oLenIn) * rPeepOuterChamfer;
        const oEndY = oCurr[0] + (oDyOut / oLenOut) * rPeepOuterChamfer;
        const oEndZ = oCurr[1] + (oDzOut / oLenOut) * rPeepOuterChamfer;

        for (let k = 0; k <= peepCornerSteps; k++) {
            const t = k / peepCornerSteps;
            const omt = 1 - t;
            peepLoopYZ.push([
                omt * omt * wStartY + 2 * omt * t * wCurr[0] + t * t * wEndY,
                omt * omt * wStartZ + 2 * omt * t * wCurr[1] + t * t * wEndZ
            ]);
            peepOuterLoopYZ.push([
                THREE.MathUtils.lerp(oStartY, oEndY, t),
                THREE.MathUtils.lerp(oStartZ, oEndZ, t)
            ]);
        }
    }

    const mapRightWallX = (loop, inset) => loop.map(([y, z]) => [
        -(getNucleoWidthAtLocalZ(z) - inset),
        y,
        z
    ]);

    const peepOuterIn = mapRightWallX(peepOuterLoopYZ, wallT);
    const peepOuterOut = mapRightWallX(peepOuterLoopYZ, 0);
    const peepInnerOut = mapRightWallX(peepLoopYZ, 0);
    const peepInnerIn = mapRightWallX(peepLoopYZ, wallT);

    group.add(new THREE.Mesh(
        createLoftedGeometry([peepOuterIn, peepOuterOut, peepInnerOut, peepInnerIn, peepOuterIn], true, false, false, 0.4),
        mats.paint
    ));

    // Vidro translúcido da Peep Window com as 4 quinas arredondadas (raio de 3 cm)
    const peepGlassIn = mapRightWallX(peepLoopYZ, 0.014);
    const peepGlassOut = mapRightWallX(peepLoopYZ, 0.014 + 0.016);
    group.add(new THREE.Mesh(
        createLoftedGeometry([peepGlassIn, peepGlassOut], true, true, true, 0.4),
        mats.glass
    ));

    // Continuação das Faixas Branco-Pérola e Dourada ao longo do Núcleo (recortadas exatamente sob o "dente" da janela)
    const aSlopeStripe = (zWindTopOuter - zWindBaseOuter) / (yRoofEdge - yBeltline);
    const zAPillarBelt = zWindBaseOuter + (yWinBot - yBeltline) * aSlopeStripe - 0.055;
    const zFrontDeltaStripe = (wCfg.posZ + wCfg.dimZ / 2) - (1.595 + 0.83 / 2);
    const zNotchFrontZ = Math.min(zAPillarBelt, zAPillarBelt - 0.03 + zFrontDeltaStripe);
    const winSpanZStripe = Math.max(0.25, zNotchFrontZ - zWinRear);
    const zNotchTopZ = zWinRear + winSpanZStripe * 0.435; // ~1.552m
    const zNotchBotZ = zWinRear + winSpanZStripe * 0.550; // ~1.650m
    const yNotchBotVal = yWinBot - yNotchDrop;            // ~1.734m

    // Retorna a altura exata da borda inferior da janela (incluindo o "dente" e seus cantos arredondados de 3cm) em função de Z
    const getWinBottomYAtZ = (z) => {
        if (z <= zNotchTopZ - 0.025 || z >= zNotchFrontZ + 0.002) return yWinBot;
        if (z >= zNotchBotZ + 0.022 && z <= zNotchFrontZ - 0.025) return yNotchBotVal;
        if (z > zNotchFrontZ - 0.025) {
            const u = THREE.MathUtils.clamp((z - (zNotchFrontZ - 0.025)) / 0.025, 0, 1);
            return yNotchBotVal + 0.025 * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
        }
        const tRamp = THREE.MathUtils.clamp((z - zNotchTopZ) / Math.max(0.01, zNotchBotZ - zNotchTopZ), 0, 1);
        return THREE.MathUtils.lerp(yWinBot, yNotchBotVal, tRamp);
    };

    [-1, 1].forEach(side => {
        const bandCenterY = yBeltline - 0.24; // 1.75m (alinhado exatamente à faixa do capô)
        const bandHalfH = 0.110;
        const yTop = bandCenterY + bandHalfH; // 1.86m
        const yBot = bandCenterY - bandHalfH; // 1.64m
        const yGoldTopMax = yTop + 0.018;     // 1.878m
        const yGoldTopMin = yTop - 0.012;     // 1.848m

        // Estações longitudinais densas incluindo as transições exatas do "dente"
        const zStationsStripe = [
            zCowlFront,
            zNotchFrontZ + 0.06,
            zNotchFrontZ + 0.002,
            zNotchFrontZ - 0.001,
            zNotchFrontZ - 0.012,
            zNotchFrontZ - 0.025,
            THREE.MathUtils.lerp(zNotchFrontZ - 0.025, zNotchBotZ + 0.022, 0.5),
            zNotchBotZ + 0.022,
            zNotchBotZ,
            THREE.MathUtils.lerp(zNotchBotZ, zNotchTopZ, 0.35),
            THREE.MathUtils.lerp(zNotchBotZ, zNotchTopZ, 0.70),
            zNotchTopZ,
            zCabRear,
            zCabRearSeal
        ];

        const creamSections = [];
        const goldBotSections = [];

        for (const z of zStationsStripe) {
            const w = getNucleoWidthAtLocalZ(z);
            const xOut = side * (w + 0.003);
            const xOutGold = side * (w + 0.0045);

            const yCreamTop = (z >= zNotchTopZ && z <= zNotchFrontZ)
                ? Math.max(yBot + 0.01, Math.min(yTop, getWinBottomYAtZ(z) - 0.001))
                : yTop;

            const ptsCream = [[xOut, yCreamTop, z], [xOut, yBot, z]];
            const ptsGoldBot = [[xOutGold, yBot + 0.012, z], [xOutGold, yBot - 0.018, z]];

            if (side < 0) {
                ptsCream.reverse();
                ptsGoldBot.reverse();
            }
            creamSections.push(ptsCream);
            goldBotSections.push(ptsGoldBot);
        }

        // Filete dourado superior dividido em 2 trechos (frontal antes do dente + traseiro atrás da rampa do dente) para não cruzar o vidro
        const tGoldTopStart = (yWinBot - yGoldTopMax) / Math.max(0.01, yWinBot - yNotchBotVal);
        const tGoldTopEnd = (yWinBot - yGoldTopMin) / Math.max(0.01, yWinBot - yNotchBotVal);
        const zGoldRearCutTop = THREE.MathUtils.lerp(zNotchTopZ, zNotchBotZ, tGoldTopStart);
        const zGoldRearCutBot = THREE.MathUtils.lerp(zNotchTopZ, zNotchBotZ, tGoldTopEnd);

        const buildGoldTopSegment = (zList) => {
            const sections = [];
            for (const item of zList) {
                const z = item.z;
                const w = getNucleoWidthAtLocalZ(z);
                const xOutGold = side * (w + 0.0045);
                const pts = [[xOutGold, item.yT, z], [xOutGold, item.yB, z]];
                if (side < 0) pts.reverse();
                sections.push(pts);
            }
            return new THREE.Mesh(createLoftedGeometry(sections, false, false, false, 0.8), mats.goldStripe);
        };

        // Trecho frontal do filete dourado superior (de zCowlFront até a borda frontal da janela)
        group.add(buildGoldTopSegment([
            { z: zCowlFront, yT: yGoldTopMax, yB: yGoldTopMin },
            { z: zNotchFrontZ + 0.08, yT: yGoldTopMax, yB: yGoldTopMin },
            { z: zNotchFrontZ + 0.001, yT: yGoldTopMax, yB: yGoldTopMin }
        ]));

        // Trecho traseiro do filete dourado superior (terminando chanfrado na rampa inclinada do "dente")
        group.add(buildGoldTopSegment([
            { z: zGoldRearCutBot, yT: yGoldTopMin + 0.001, yB: yGoldTopMin },
            { z: zGoldRearCutTop, yT: yGoldTopMax, yB: yGoldTopMin },
            { z: THREE.MathUtils.lerp(zGoldRearCutTop, zCabRear, 0.5), yT: yGoldTopMax, yB: yGoldTopMin },
            { z: zCabRear, yT: yGoldTopMax, yB: yGoldTopMin },
            { z: zCabRearSeal, yT: yGoldTopMax, yB: yGoldTopMin }
        ]));

        group.add(new THREE.Mesh(createLoftedGeometry(creamSections, false, false, false, 0.8), mats.creamStripe));
        group.add(new THREE.Mesh(createLoftedGeometry(goldBotSections, false, false, false, 0.8), mats.goldStripe));

        // Prolongamento da Saia Inferior Cromada ao longo de todo o Núcleo (de zCabRearSeal até zCowlFront) + 3 Luzes Ovais Âmbar Realistas sob a porta
        const ySkirtBot = yCabBottom;           // 0.89m
        const ySkirtTop = yCabBottom + 0.11;    // 1.00m
        const ySkirtMid = yCabBottom + 0.055;   // 0.945m
        const cabSkirtSections = [];
        const cabSkirtSteps = 6;
        for (let i = 0; i <= cabSkirtSteps; i++) {
            const z = THREE.MathUtils.lerp(zCabRearSeal, zCowlFront, i / cabSkirtSteps);
            const w = getNucleoWidthAtLocalZ(z);
            const xIn = side * (w - 0.005);
            const xOut = side * (w + 0.011);
            const pts = [
                [xIn, ySkirtBot, z],
                [xIn, ySkirtTop, z],
                [xOut, ySkirtTop, z],
                [xOut, ySkirtBot, z]
            ];
            if (side > 0) pts.reverse();
            cabSkirtSections.push(pts);
        }
        group.add(new THREE.Mesh(createLoftedGeometry(cabSkirtSections, true, true, true, 0.4), mats.chrome));

        const coneSlopeAngleCab = Math.atan2(CONE_W_END - CONE_W_START, HOOD_Z_START - NUCLEO_Z_END_WORLD);
        [1.31, 1.63, 1.95].forEach(zLamp => {
            const wLamp = getNucleoWidthAtLocalZ(zLamp);
            group.add(buildOvalMarkerLamp(
                side,
                side * (wLamp + 0.011),
                ySkirtMid,
                zLamp,
                side * coneSlopeAngleCab,
                mats
            ));
        });
    });

    // 6.3 Para-brisa Bipartido em V (recuo de 0.12m da base ao topo) + Colunas A, B, Janelas Laterais e Teto Cônico do Núcleo
    const wWindBaseOuter = getNucleoWidthAtLocalZ(zWindBaseOuter);
    const wWindTopOuter = getNucleoWidthAtLocalZ(zWindTopOuter);

    // Coluna divisória central do para-brisa em V com 1 cm de largura no eixo X (0.01m, hw = 0.005m)
    const centerPostSections = [];
    for (let i = 0; i <= 2; i++) {
        const s = i / 2;
        const y = THREE.MathUtils.lerp(yBeltline, yRoofEdge, s);
        const zF = THREE.MathUtils.lerp(zWindBaseCenter, zWindTopCenter, s);
        const zR = zF - 0.045;
        const hw = 0.005; // Meia-largura = 0.5 cm -> Largura total no eixo X = 1 cm (0.01m)
        centerPostSections.push([
            [-hw, y, zR],
            [-hw, y, zF],
            [hw, y, zF],
            [hw, y, zR]
        ]);
    }
    group.add(new THREE.Mesh(createLoftedGeometry(centerPostSections, true, true, true, 0.4), mats.chrome));

    // Painéis de vidro esquerdo e direito do para-brisa em V + Colunas e Janelas acompanhando a reta cônica
    [-1, 1].forEach(side => {
        // O vidro do para-brisa termina exatamente na face interna da Coluna A (sem invadir a coluna)
        const uWindOuterB = (wWindBaseOuter - 0.046) / wWindBaseOuter;
        const uWindOuterT = (wWindTopOuter - 0.046) / wWindTopOuter;
        const pBL = [0, yBeltline, zWindBaseCenter - 0.004];
        const pBR = [side * (wWindBaseOuter - 0.046), yBeltline, THREE.MathUtils.lerp(zWindBaseCenter, zWindBaseOuter, uWindOuterB) - 0.004];
        const pTL = [0, yRoofEdge, zWindTopCenter - 0.004];
        const pTR = [side * (wWindTopOuter - 0.046), yRoofEdge, THREE.MathUtils.lerp(zWindTopCenter, zWindTopOuter, uWindOuterT) - 0.004];

        const sec0 = side > 0 ? [pBL, pBR] : [pBR, pBL];
        const sec1 = side > 0 ? [pTL, pTR] : [pTR, pTL];
        const windGeo = createLoftedGeometry([sec0, sec1], false, false, false, 0.8);
        group.add(new THREE.Mesh(windGeo, mats.glass));

        // Coluna A inclinada (A-Pillar) com face frontal alinhada a zWindBaseOuter..zWindTopOuter para encaixar 100% sob o teto
        const aPillarSections = [];
        for (let i = 0; i <= 3; i++) {
            const s = i / 3;
            const z = THREE.MathUtils.lerp(zWindBaseOuter, zWindTopOuter, s);
            const y = THREE.MathUtils.lerp(yBeltline, yRoofEdge, s);
            const zF = z;
            const zR = z - 0.055;
            const wOutF = getNucleoWidthAtLocalZ(zF);
            const wInF = wOutF - 0.05;
            const wOutR = getNucleoWidthAtLocalZ(zR);
            const wInR = wOutR - 0.05;
            const xMinF = side < 0 ? -wOutF : wInF;
            const xMaxF = side < 0 ? -wInF : wOutF;
            const xMinR = side < 0 ? -wOutR : wInR;
            const xMaxR = side < 0 ? -wInR : wOutR;
            // Ordem horária no plano XZ (quando loftada para +Y, gera normais apontando para FORA em todas as 4 faces)
            aPillarSections.push([
                [xMinR, y, zR],
                [xMinF, y, zF],
                [xMaxF, y, zF],
                [xMaxR, y, zR]
            ]);
        }
        group.add(new THREE.Mesh(createLoftedGeometry(aPillarSections, true, true, true, 0.4), mats.paint));

        // Face traseira exata da coluna A (z - 0.055) para limitar o vidro da janela lateral sem invadir a coluna A
        const aSlope = (zWindTopOuter - zWindBaseOuter) / (yRoofEdge - yBeltline);
        const zAPillarAtY = (y) => zWindBaseOuter + (y - yBeltline) * aSlope - 0.055;

        // Extremidade frontal da janela recuada 3 cm (0.03m) para trás em relação à face traseira da coluna A
        const zFrontDelta = (wCfg.posZ + wCfg.dimZ / 2) - (1.595 + 0.83 / 2);
        const zWinFrontBelt = Math.min(zAPillarAtY(yWinBot), zAPillarAtY(yWinBot) - 0.03 + zFrontDelta);
        const zWinFrontBot = zWinFrontBelt; // Na região do "dente" abaixo de yBeltline, a frente desce 100% vertical paralela à moldura frontal
        const zWinFrontTop = Math.min(zAPillarAtY(yWinTop), zAPillarAtY(yWinTop) - 0.03 + zFrontDelta);

        // Geometria do "dente" frontal inferior (Kenworth Daylite Door Window Drop) nas duas portas:
        const yNotchBot = yWinBot - yNotchDrop; // 1.734m (na altura da linha verde indicada)
        const winSpanZ = Math.max(0.25, zWinFrontBot - zWinRear);
        const zNotchRearTop = zWinRear + winSpanZ * 0.435; // ~1.552m (fim do trecho horizontal traseiro e início da rampa inclinada do dente)
        const zNotchRearBot = zWinRear + winSpanZ * 0.550; // ~1.650m (base da rampa inclinada seguindo a linha verde)

        // Fecha o pequeno trecho sob a base da Coluna A (entre zDoorFront = 2.12m e zAPillarAtY(yBeltline) = 2.065m, de yLowerWallTop até yBeltline)
        group.add(makeConicalWallPanel(side, zDoorFront, zAPillarAtY(yBeltline), yLowerWallTop, yBeltline, mats.paint, 0, 0.05));

        // Quadro superior da porta + Vidro com o "dente" inferior frontal e todas as quinas arredondadas (raio = 3 cm = 0.03m)
        const yOuterBot = yLowerWallTop;
        const yOuterTop = yRoofEdge;
        const winCorners = [
            [yWinTop, zWinRear],          // 0: Topo-Traseiro
            [yWinBot, zWinRear],          // 1: Base-Traseira (altura principal da janela)
            [yWinBot, zNotchRearTop],     // 2: Início superior da rampa do "dente"
            [yNotchBot, zNotchRearBot],   // 3: Base inferior traseira do "dente"
            [yNotchBot, zWinFrontBot],    // 4: Base inferior frontal do "dente"
            [yWinBot, zWinFrontBelt],     // 5: Encontro da frente vertical do "dente" com a inclinação da Coluna A
            [yWinTop, zWinFrontTop]       // 6: Topo-Frontal
        ];
        const outerFrameCorners = [
            [yOuterTop, zCabRearSeal],           // 0: Topo-Traseiro externo
            [yOuterBot, zCabRearSeal],           // 1: Base-Traseira externa
            [yOuterBot, zNotchRearTop],          // 2: Base externa sob o início da rampa do "dente"
            [yOuterBot, zNotchRearBot],          // 3: Base externa sob a base da rampa do "dente"
            [yOuterBot, zAPillarAtY(yBeltline)], // 4: Base-Frontal externa
            [yBeltline, zAPillarAtY(yBeltline)], // 5: Cintura-Frontal externa (base da Coluna A)
            [yOuterTop, zAPillarAtY(yOuterTop)]  // 6: Topo-Frontal externo (topo da Coluna A)
        ];

        const rWinCorner = 0.03; // Raio de arredondamento de 3 cm nas quinas da janela e do "dente"
        const rOuterChamfer = 0.002;
        const winCornerSteps = 8;
        const winLoopYZ = [];
        const outerLoopYZ = [];
        const nWinCorners = winCorners.length;

        for (let c = 0; c < nWinCorners; c++) {
            const wPrev = winCorners[(c + nWinCorners - 1) % nWinCorners];
            const wCurr = winCorners[c];
            const wNext = winCorners[(c + 1) % nWinCorners];

            const dyIn = wPrev[0] - wCurr[0], dzIn = wPrev[1] - wCurr[1];
            const lenIn = Math.hypot(dyIn, dzIn) || 1;
            const dyOut = wNext[0] - wCurr[0], dzOut = wNext[1] - wCurr[1];
            const lenOut = Math.hypot(dyOut, dzOut) || 1;

            const dIn = Math.min(rWinCorner, lenIn * 0.45);
            const dOut = Math.min(rWinCorner, lenOut * 0.45);

            const wStartY = wCurr[0] + (dyIn / lenIn) * dIn;
            const wStartZ = wCurr[1] + (dzIn / lenIn) * dIn;
            const wEndY = wCurr[0] + (dyOut / lenOut) * dOut;
            const wEndZ = wCurr[1] + (dzOut / lenOut) * dOut;

            const oPrev = outerFrameCorners[(c + nWinCorners - 1) % nWinCorners];
            const oCurr = outerFrameCorners[c];
            const oNext = outerFrameCorners[(c + 1) % nWinCorners];
            const oDyIn = oPrev[0] - oCurr[0], oDzIn = oPrev[1] - oCurr[1];
            const oLenIn = Math.hypot(oDyIn, oDzIn) || 1;
            const oDyOut = oNext[0] - oCurr[0], oDzOut = oNext[1] - oCurr[1];
            const oLenOut = Math.hypot(oDyOut, oDzOut) || 1;

            const oStartY = oCurr[0] + (oDyIn / oLenIn) * rOuterChamfer;
            const oStartZ = oCurr[1] + (oDzIn / oLenIn) * rOuterChamfer;
            const oEndY = oCurr[0] + (oDyOut / oLenOut) * rOuterChamfer;
            const oEndZ = oCurr[1] + (oDzOut / oLenOut) * rOuterChamfer;

            for (let k = 0; k <= winCornerSteps; k++) {
                const t = k / winCornerSteps;
                const omt = 1 - t;
                winLoopYZ.push([
                    omt * omt * wStartY + 2 * omt * t * wCurr[0] + t * t * wEndY,
                    omt * omt * wStartZ + 2 * omt * t * wCurr[1] + t * t * wEndZ
                ]);
                outerLoopYZ.push([
                    THREE.MathUtils.lerp(oStartY, oEndY, t),
                    THREE.MathUtils.lerp(oStartZ, oEndZ, t)
                ]);
            }
        }

        if (side > 0) {
            winLoopYZ.reverse();
            outerLoopYZ.reverse();
        }

        const frameThick = 0.05;
        const mapToConicalX = (loop, inset) => loop.map(([y, z]) => [
            side * (getNucleoWidthAtLocalZ(z) - inset),
            y,
            z
        ]);

        const outerLoopIn = mapToConicalX(outerLoopYZ, frameThick);
        const outerLoopOut = mapToConicalX(outerLoopYZ, 0);
        const innerLoopOut = mapToConicalX(winLoopYZ, 0);
        const innerLoopIn = mapToConicalX(winLoopYZ, frameThick);

        group.add(new THREE.Mesh(
            createLoftedGeometry([outerLoopIn, outerLoopOut, innerLoopOut, innerLoopIn, outerLoopIn], true, false, false, 0.4),
            mats.paint
        ));

        // Vidro lateral da janela da porta com as 4 quinas arredondadas (raio de 3 cm)
        const glassInsetOut = 0.012 - xWinDelta;
        const glassInsetIn = glassInsetOut + winThick;
        const glassSecIn = mapToConicalX(winLoopYZ, side < 0 ? glassInsetOut : glassInsetIn);
        const glassSecOut = mapToConicalX(winLoopYZ, side < 0 ? glassInsetIn : glassInsetOut);
        group.add(new THREE.Mesh(
            createLoftedGeometry([glassSecIn, glassSecOut], true, true, true, 0.4),
            mats.glass
        ));

        // Moldura cromada contínua de cantos arredondados que delinea todo o contorno da porta do núcleo
        const yDoorBot = yCabBottom + 0.18; // 1.07m (acima da saia inferior da cabine e abaixo da peep window)
        const yDoorTop = (yRoofEdge - 0.012) + 0.05; // 2.508m (movida 5 cm para cima)
        const zDoorRearMolding = 1.118;              // 1.118m (mantém a posição traseira da moldura da porta)
        const zDoorFrontBelt = zAPillarAtY(yBeltline) + 0.030;                 // ~2.095m (logo atrás do filtro de ar, na base da coluna A)
        const zDoorFrontBot = zDoorFrontBelt;                                  // Desce 100% vertical da linha de cintura até a base da porta
        const zDoorFrontTop = zAPillarAtY(yDoorTop) + 0.030;                   // Acompanha a inclinação exata da coluna A até a nova altura yDoorTop

        const doorCorners = [
            [yDoorTop, zDoorRearMolding],  // 0: Topo-Traseiro
            [yDoorBot, zDoorRearMolding],  // 1: Base-Traseiro
            [yDoorBot, zDoorFrontBot],     // 2: Base-Frontal
            [yBeltline, zDoorFrontBelt],   // 3: Cintura-Frontal (encontro do trecho vertical com a Coluna A inclinada)
            [yDoorTop, zDoorFrontTop]      // 4: Topo-Frontal (topo da Coluna A)
        ];
        const doorRadii = [0.075, 0.075, 0.075, 0.055, 0.055];
        const cornerTrimData = [];
        const nCorners = doorCorners.length;

        for (let c = 0; c < nCorners; c++) {
            const pPrev = doorCorners[(c + nCorners - 1) % nCorners];
            const pCurr = doorCorners[c];
            const pNext = doorCorners[(c + 1) % nCorners];
            const r = doorRadii[c];

            const dyIn = pCurr[0] - pPrev[0], dzIn = pCurr[1] - pPrev[1];
            const lenIn = Math.hypot(dyIn, dzIn) || 1;
            const tyIn = dyIn / lenIn, tzIn = dzIn / lenIn;

            const dyOut = pNext[0] - pCurr[0], dzOut = pNext[1] - pCurr[1];
            const lenOut = Math.hypot(dyOut, dzOut) || 1;
            const tyOut = dyOut / lenOut, tzOut = dzOut / lenOut;

            const dIn = Math.min(r, lenIn * 0.42);
            const dOut = Math.min(r, lenOut * 0.42);

            cornerTrimData.push({
                pCurr,
                startY: pCurr[0] - tyIn * dIn,
                startZ: pCurr[1] - tzIn * dIn,
                endY: pCurr[0] + tyOut * dOut,
                endZ: pCurr[1] + tzOut * dOut,
                tyOut,
                tzOut
            });
        }

        const pathSamples = [];
        const cornerSubdivs = 8;
        const edgeSubdivs = 4;

        for (let c = 0; c < nCorners; c++) {
            const curr = cornerTrimData[c];
            const next = cornerTrimData[(c + 1) % nCorners];

            // Arco suave de Bézier quadrática no canto c
            for (let k = 0; k <= cornerSubdivs; k++) {
                const t = k / cornerSubdivs;
                const omt = 1 - t;
                const y = omt * omt * curr.startY + 2 * omt * t * curr.pCurr[0] + t * t * curr.endY;
                const z = omt * omt * curr.startZ + 2 * omt * t * curr.pCurr[1] + t * t * curr.endZ;
                const dY = 2 * omt * (curr.pCurr[0] - curr.startY) + 2 * t * (curr.endY - curr.pCurr[0]);
                const dZ = 2 * omt * (curr.pCurr[1] - curr.startZ) + 2 * t * (curr.endZ - curr.pCurr[1]);
                const dLen = Math.hypot(dY, dZ) || 1;
                pathSamples.push({ y, z, ty: dY / dLen, tz: dZ / dLen });
            }

            // Segmento reto até o início do próximo canto (acompanhando a conicidade da parede do núcleo em Z)
            for (let k = 1; k < edgeSubdivs; k++) {
                const s = k / edgeSubdivs;
                const y = THREE.MathUtils.lerp(curr.endY, next.startY, s);
                const z = THREE.MathUtils.lerp(curr.endZ, next.startZ, s);
                pathSamples.push({ y, z, ty: curr.tyOut, tz: curr.tzOut });
            }
        }

        const halfWidthMolding = 0.0075; // 1.5 cm de largura total do friso cromado no plano YZ (2 * 0.0075m = 0.015m)
        const moldingProtrusion = 0.0085; // 8.5 mm de relevo cromado para fora da parede cônica
        const profileSegs = 6;
        const doorMoldingSections = [];

        for (let i = 0; i <= pathSamples.length; i++) {
            const sample = pathSamples[i % pathSamples.length];
            const ny = -sample.tz;
            const nz = sample.ty;
            const ring = [];

            for (let m = 0; m <= profileSegs; m++) {
                const theta = (m / profileSegs) * Math.PI;
                const wOff = -halfWidthMolding * Math.cos(theta);
                const xRel = -0.002 + (moldingProtrusion + 0.002) * Math.sin(theta);
                const yPt = sample.y + wOff * ny;
                const zPt = sample.z + wOff * nz;
                const wCab = getNucleoWidthAtLocalZ(zPt);
                ring.push([side * (wCab + xRel), yPt, zPt]);
            }

            if (side > 0) ring.reverse();
            doorMoldingSections.push(ring);
        }

        group.add(new THREE.Mesh(createLoftedGeometry(doorMoldingSections, true, false, false, 0.55), mats.chrome));
    });

    // Teto Cônico Inclinado do Núcleo com ombros laterais suavizados em curva contínua (sem quina viva nas laterais)
    // e testeira frontal em V fechada acima do para-brisa e das colunas
    const nucleoRoofSections = [];
    const roofSteps = 12;
    const shoulderSteps = 8;
    const crownSteps = 16;
    const uShoulderIn = 0.80;
    const crownDrop = 0.012;
    let frontBotProfile = null;
    let frontTopProfile = null;

    // Estende 0.06m para trás de zCabRear (dentro do sleeper) mantendo a seção final para vedar 100% o ombro arredondado no encontro com o sleeper
    for (let i = 0; i <= roofSteps + 1; i++) {
        const sClamped = Math.min(1, i / roofSteps);
        const zExtra = i > roofSteps ? -0.06 : 0.0;
        const zOuter = THREE.MathUtils.lerp(zWindTopOuter, zCabRear, sClamped) + zExtra;
        const zCenter = THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped) + zExtra;

        const zOuterWidthRef = THREE.MathUtils.lerp(zWindTopOuter, zCabRear, sClamped);
        const wOut = getNucleoWidthAtLocalZ(zOuterWidthRef);
        const yBase = yRoofEdge - 0.005;

        const yCrownAtU = (uAbs) => {
            const zRef = THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            );
            const tNorm = uAbs / uShoulderIn;
            return localRoofHeightAtZ(zRef, uAbs) - crownDrop * (tNorm * tNorm);
        };

        const yShoulderCrown = yCrownAtU(uShoulderIn);
        const dyCrownDu = -2 * crownDrop / uShoulderIn;
        const yCornerVirtual = yShoulderCrown + (1 - uShoulderIn) * dyCrownDu;
        const rShoulderY = THREE.MathUtils.lerp(0.075, 0.080, sClamped);
        const yShoulderBot = Math.max(yBase + 0.04, yCornerVirtual - rShoulderY);

        const topCurvePts = [];

        // Ombro arredondado esquerdo (Bézier quadrática tangente à parede vertical em tau=0 e tangente à coroa do teto em tau=1)
        for (let k = 0; k <= shoulderSteps; k++) {
            const tau = k / shoulderSteps; // 0 na parede vertical (-wOut), 1 no início da coroa (-uShoulderIn)
            const inv = 1 - tau;
            const uAbs = inv * inv * 1.0 + 2 * inv * tau * 1.0 + tau * tau * uShoulderIn;
            const yPt = inv * inv * yShoulderBot + 2 * inv * tau * yCornerVirtual + tau * tau * yShoulderCrown;
            const zPt = THREE.MathUtils.lerp(zCenter, zOuter, uAbs);
            const wAtU = getNucleoWidthAtLocalZ(THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            ));
            topCurvePts.push([-wAtU * uAbs, yPt, zPt]);
        }

        // Coroa central suave do teto (de -uShoulderIn até +uShoulderIn)
        for (let k = 1; k < crownSteps; k++) {
            const uSigned = THREE.MathUtils.lerp(-uShoulderIn, uShoulderIn, k / crownSteps);
            const uAbs = Math.abs(uSigned);
            const sgn = uSigned < 0 ? -1 : 1;
            const yPt = yCrownAtU(uAbs);
            const zPt = THREE.MathUtils.lerp(zCenter, zOuter, uAbs);
            const wAtU = getNucleoWidthAtLocalZ(THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            ));
            topCurvePts.push([sgn * wAtU * uAbs, yPt, zPt]);
        }

        // Ombro arredondado direito (tau=0 no fim da coroa +uShoulderIn até tau=1 na parede vertical +wOut)
        for (let k = 0; k <= shoulderSteps; k++) {
            const tau = k / shoulderSteps;
            const inv = 1 - tau;
            const uAbs = inv * inv * uShoulderIn + 2 * inv * tau * 1.0 + tau * tau * 1.0;
            const yPt = inv * inv * yShoulderCrown + 2 * inv * tau * yCornerVirtual + tau * tau * yShoulderBot;
            const zPt = THREE.MathUtils.lerp(zCenter, zOuter, uAbs);
            const wAtU = getNucleoWidthAtLocalZ(THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            ));
            topCurvePts.push([wAtU * uAbs, yPt, zPt]);
        }

        const botCurvePts = topCurvePts.map(pt => [pt[0], yBase, pt[2]]);

        if (i === 0) {
            frontBotProfile = botCurvePts;
            frontTopProfile = topCurvePts;
        }

        const sectionRing = [
            [-wOut, yBase, zOuter],
            ...topCurvePts,
            [wOut, yBase, zOuter]
        ];
        for (let k = botCurvePts.length - 2; k >= 1; k--) {
            sectionRing.push(botCurvePts[k]);
        }
        nucleoRoofSections.push(sectionRing);
    }
    group.add(new THREE.Mesh(createLoftedGeometry(nucleoRoofSections, true, false, true, 0.55), mats.paint));
    if (frontBotProfile && frontTopProfile) {
        // Fecha as duas faces frontais em V da testeira do teto acompanhando a curvatura dos ombros laterais
        group.add(new THREE.Mesh(createLoftedGeometry([frontBotProfile, frontTopProfile], false, false, false, 0.55), mats.paint));
    }

    // 6.3b Janela de Teto (Sunroof / Teto Solar Panorâmico) no Teto do Núcleo (destacada em verde na imagem de referência):
    //      Retângulo de cantos arredondados conformado 100% à curvatura transversal e longitudinal da coroa do teto do núcleo,
    //      com guarnição perimetral de borracha preta e vidro fumê automotivo sobre fundo escuro.
    const getRoofCrownSurfaceY = (x, z) => {
        const wAtZ = Math.max(0.35, getNucleoWidthAtLocalZ(z));
        const uAbs = Math.min(uShoulderIn, Math.abs(x) / wAtZ);
        const tNorm = uAbs / uShoulderIn;
        return localRoofHeightAtZ(z, uAbs) - crownDrop * (tNorm * tNorm);
    };

    const buildContouredRoofRoundedPad = (wHalf, zRearPad, zFrontPad, rCorner, yOffsetBot, yOffsetTop, mat) => {
        const cornerStepsZ = 10;
        const midStepsZ = 8;
        const latStepsX = 16;
        const zStationsPad = [];

        for (let i = 0; i <= cornerStepsZ; i++) {
            const theta = (i / cornerStepsZ) * (Math.PI * 0.5); // 0 -> PI/2
            zStationsPad.push(zRearPad + rCorner * (1 - Math.cos(theta)));
        }
        for (let i = 1; i < midStepsZ; i++) {
            zStationsPad.push(THREE.MathUtils.lerp(zRearPad + rCorner, zFrontPad - rCorner, i / midStepsZ));
        }
        for (let i = 0; i <= cornerStepsZ; i++) {
            const theta = (i / cornerStepsZ) * (Math.PI * 0.5); // 0 -> PI/2
            zStationsPad.push((zFrontPad - rCorner) + rCorner * Math.sin(theta));
        }

        const padSections = [];
        for (const z of zStationsPad) {
            let xSpanHalf = wHalf;
            if (z < zRearPad + rCorner) {
                const dz = (zRearPad + rCorner) - z;
                xSpanHalf = (wHalf - rCorner) + Math.sqrt(Math.max(1e-6, rCorner * rCorner - dz * dz));
            } else if (z > zFrontPad - rCorner) {
                const dz = z - (zFrontPad - rCorner);
                xSpanHalf = (wHalf - rCorner) + Math.sqrt(Math.max(1e-6, rCorner * rCorner - dz * dz));
            }
            xSpanHalf = Math.max(0.002, xSpanHalf);

            const ring = [];
            for (let j = 0; j <= latStepsX; j++) {
                const x = THREE.MathUtils.lerp(-xSpanHalf, xSpanHalf, j / latStepsX);
                ring.push([x, getRoofCrownSurfaceY(x, z) + yOffsetTop, z]);
            }
            for (let j = latStepsX; j >= 0; j--) {
                const x = THREE.MathUtils.lerp(-xSpanHalf, xSpanHalf, j / latStepsX);
                ring.push([x, getRoofCrownSurfaceY(x, z) + yOffsetBot, z]);
            }
            padSections.push(ring);
        }
        return new THREE.Mesh(createLoftedGeometry(padSections, true, true, true, 0.55), mat);
    };

    const sunWOuter = 0.380; // Meia-largura externa da guarnição = 0.38m (largura total = 0.76m, entre as duas buzinas)
    const sunZRear = 1.385;  // Borda traseira da janela do teto
    const sunZFront = 1.885; // Borda frontal da janela do teto (logo atrás das 3 lâmpadas centrais do teto)
    const sunROuter = 0.120; // Raio generoso dos 4 cantos arredondados (12 cm)
    const sunRimW = 0.024;   // Largura da moldura de borracha preta ao redor do vidro (2.4 cm)

    // 1. Guarnição externa de borracha preta vulcanizada assentada sobre o teto
    group.add(buildContouredRoofRoundedPad(sunWOuter, sunZRear, sunZFront, sunROuter, -0.002, 0.0065, mats.rubber));
    // 2. Fundo interno escuro da janela do teto
    group.add(buildContouredRoofRoundedPad(
        sunWOuter - sunRimW,
        sunZRear + sunRimW,
        sunZFront - sunRimW,
        sunROuter - sunRimW,
        0.001,
        0.0072,
        mats.interiorDark
    ));
    // 3. Lente de vidro fumê automotivo da janela do teto
    group.add(buildContouredRoofRoundedPad(
        sunWOuter - sunRimW + 0.002,
        sunZRear + sunRimW - 0.002,
        sunZFront - sunRimW + 0.002,
        sunROuter - sunRimW + 0.002,
        0.002,
        0.0086,
        mats.glass
    ));

    // 6.3c Guarnição/Coifa de Borracha Sanfonada na Junção do Núcleo com o Sleeper (inspirada na junção do sleeper com os defletores):
    //      Contorna todo o perímetro onde as paredes laterais, os ombros arredondados e a coroa do teto do núcleo encontram
    //      a parede frontal curva e o fillet inferior do sleeper, evidenciando o acoplamento entre as duas peças.
    const getSleeperFrontJunctionZ = (x, y) => {
        const absX = Math.min(SLEEPER_HALF_W, Math.abs(x));
        const zF = getSleeperFrontZ(absX);
        const xShoulderSlp = SLEEPER_HALF_W - SLEEPER_CORNER_RADIUS; // 1.090m
        const tSlp = Math.min(1, absX / xShoulderSlp);
        const yBaseSlp = 2.892 - 0.014 * (tSlp * tSlp);
        const yHighSlp = SLEEPER_Y_TOP - 0.018 * (tSlp * tSlp);
        const outerBlend = THREE.MathUtils.smoothstep(absX, 0.72 * (SLEEPER_HALF_W / 1.045), SLEEPER_HALF_W);
        const dBot = THREE.MathUtils.lerp(0.080, 0.125, outerBlend);
        const tBot = THREE.MathUtils.lerp(0.18, 0.30, outerBlend);
        const yVertTop = yBaseSlp - dBot;
        if (y <= yVertTop) return zF;
        const yRampBotEnd = THREE.MathUtils.lerp(yBaseSlp, yHighSlp, tBot);
        const zRampTop = Math.max(SLEEPER_Z_REAR + 0.12, zF - 0.56);
        const zRampBotEnd = THREE.MathUtils.lerp(zF, zRampTop, tBot);
        const uFillet = THREE.MathUtils.clamp((y - yVertTop) / Math.max(0.01, yRampBotEnd - yVertTop), 0, 1);
        return zF - (uFillet * uFillet) * (zF - zRampBotEnd);
    };

    const evalNucleoProfileAtZ = (mode, param, zEst) => {
        const sClamped = THREE.MathUtils.clamp((zWindTopCenter - zEst) / (zWindTopCenter - zCabRear), 0, 1);
        const zOuterWidthRef = THREE.MathUtils.lerp(zWindTopOuter, zCabRear, sClamped);
        const wOut = getNucleoWidthAtLocalZ(zOuterWidthRef);
        const yBase = yRoofEdge - 0.005;

        const yCrownAtU = (uAbs) => {
            const zRef = THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            );
            const tNorm = uAbs / uShoulderIn;
            return localRoofHeightAtZ(zRef, uAbs) - crownDrop * (tNorm * tNorm);
        };

        const yShoulderCrown = yCrownAtU(uShoulderIn);
        const dyCrownDu = -2 * crownDrop / uShoulderIn;
        const yCornerVirtual = yShoulderCrown + (1 - uShoulderIn) * dyCrownDu;
        const rShoulderY = THREE.MathUtils.lerp(0.075, 0.080, sClamped);
        const yShoulderBot = Math.max(yBase + 0.04, yCornerVirtual - rShoulderY);
        const yWallBot = yCabBottom + 0.11; // Logo acima da saia cromada inferior

        if (mode === 'leftWall') {
            const y = THREE.MathUtils.lerp(yWallBot, yShoulderBot, param);
            return { x: -wOut, y, nx: -1, ny: 0 };
        }
        if (mode === 'rightWall') {
            const y = THREE.MathUtils.lerp(yShoulderBot, yWallBot, param);
            return { x: wOut, y, nx: 1, ny: 0 };
        }
        if (mode === 'leftShoulder') {
            const tau = param;
            const inv = 1 - tau;
            const uAbs = inv * inv * 1.0 + 2 * inv * tau * 1.0 + tau * tau * uShoulderIn;
            const y = inv * inv * yShoulderBot + 2 * inv * tau * yCornerVirtual + tau * tau * yShoulderCrown;
            const wAtU = getNucleoWidthAtLocalZ(THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            ));
            const angle = THREE.MathUtils.lerp(Math.PI, Math.PI * 0.5, tau);
            return { x: -wAtU * uAbs, y, nx: Math.cos(angle), ny: Math.sin(angle) };
        }
        if (mode === 'rightShoulder') {
            const tau = param;
            const inv = 1 - tau;
            const uAbs = inv * inv * uShoulderIn + 2 * inv * tau * 1.0 + tau * tau * 1.0;
            const y = inv * inv * yShoulderCrown + 2 * inv * tau * yCornerVirtual + tau * tau * yShoulderBot;
            const wAtU = getNucleoWidthAtLocalZ(THREE.MathUtils.lerp(
                THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
                zOuterWidthRef,
                uAbs
            ));
            const angle = THREE.MathUtils.lerp(Math.PI * 0.5, 0.0, tau);
            return { x: wAtU * uAbs, y, nx: Math.cos(angle), ny: Math.sin(angle) };
        }
        // mode === 'crown'
        const uSigned = THREE.MathUtils.lerp(-uShoulderIn, uShoulderIn, param);
        const uAbs = Math.abs(uSigned);
        const sgn = uSigned < 0 ? -1 : 1;
        const y = yCrownAtU(uAbs);
        const wAtU = getNucleoWidthAtLocalZ(THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(zWindTopCenter, zCabRear, sClamped),
            zOuterWidthRef,
            uAbs
        ));
        return { x: sgn * wAtU * uAbs, y, nx: 0.04 * uSigned, ny: 1.0 };
    };

    const junctionSamples = [];
    const pushJunctionSample = (mode, param) => {
        let zCur = 1.06;
        let pt = evalNucleoProfileAtZ(mode, param, zCur);
        for (let iter = 0; iter < 3; iter++) {
            zCur = getSleeperFrontJunctionZ(pt.x, pt.y);
            pt = evalNucleoProfileAtZ(mode, param, zCur);
        }
        const nLen = Math.hypot(pt.nx, pt.ny) || 1;
        junctionSamples.push({
            x: pt.x,
            y: pt.y,
            z: zCur,
            nx: pt.nx / nLen,
            ny: pt.ny / nLen
        });
    };

    const jWallSteps = 10;
    const jShoulderSteps = 10;
    const jCrownSteps = 20;
    for (let i = 0; i < jWallSteps; i++) pushJunctionSample('leftWall', i / jWallSteps);
    for (let i = 0; i < jShoulderSteps; i++) pushJunctionSample('leftShoulder', i / jShoulderSteps);
    for (let i = 0; i <= jCrownSteps; i++) pushJunctionSample('crown', i / jCrownSteps);
    for (let i = 1; i <= jShoulderSteps; i++) pushJunctionSample('rightShoulder', i / jShoulderSteps);
    for (let i = 1; i <= jWallSteps; i++) pushJunctionSample('rightWall', i / jWallSteps);

    // Perfil transversal da junta/coifa de borracha sanfonada (2 gomos arredondados com sulco central, como na junção do defletor)
    const bootCrossProfile = [
        { dz: -0.014, dn: -0.012 }, // Aba interna embutida dentro do sleeper
        { dz: -0.003, dn:  0.0085 }, // Gomo traseiro encostado na face frontal do sleeper
        { dz:  0.004, dn:  0.0092 },
        { dz:  0.009, dn:  0.0045 }, // Sulco central (fenda de articulação entre as duas peças)
        { dz:  0.014, dn:  0.0090 }, // Gomo frontal sobre o núcleo
        { dz:  0.022, dn:  0.0075 },
        { dz:  0.025, dn:  0.0010 }, // Borda chanfrada frontal sobre a pintura do núcleo
        { dz:  0.025, dn: -0.012 }  // Retorno interno
    ];

    const junctionBootSections = junctionSamples.map(sp =>
        bootCrossProfile.map(bp => [
            sp.x + sp.nx * bp.dn,
            sp.y + sp.ny * bp.dn,
            sp.z + bp.dz
        ])
    );
    group.add(new THREE.Mesh(createLoftedGeometry(junctionBootSections, true, true, true, 0.50), mats.rubber));

    // Parede Traseira do Núcleo (fechando o fundo do Núcleo em Z = zCabRear + 0.02..zCabRearSeal com altura de 1.84m acima do chassi)
    const rearWallSections = [];
    [zCabRear + 0.02, zCabRearSeal].forEach(z => {
        const w = getNucleoWidthAtLocalZ(z);
        rearWallSections.push([
            [-w, yCabBottom, z],
            [-w, yRoofEdge, z],
            [0, yNucleoTop, z],
            [w, yRoofEdge, z],
            [w, yCabBottom, z]
        ]);
    });
    group.add(new THREE.Mesh(createLoftedGeometry(rearWallSections, true, true, true, 0.4), mats.paint));

    // 6.4 INTERIOR 3D COMPLETO DA CABINE (painel mais curto e com inclinação acompanhando a linha rosa,
    //     além de volante e alavanca de câmbio reposicionados mais à frente)
    const wDash = getNucleoWidthAtLocalZ(2.00) - 0.055;
    const yDashTop = 1.955;
    const zDashFront = 2.14;
    const zDashTopRear = 1.965; // Topo da face traseira do painel (início superior da linha rosa)
    const yDashBotRear = 1.730; // Base visível na janela da face traseira do painel
    const zDashBotRear = 1.895; // Base da face traseira do painel (fim inferior da linha rosa)
    const dashTiltX = Math.atan2(zDashTopRear - zDashBotRear, yDashTop - yDashBotRear); // ~+0.302 rad (+17.3°)

    // Perfil transversal (Y, Z) em sentido anti-horário visto de +X para que todas as normais apontem para fora
    const dashProfileYZ = [
        [1.60, zDashFront],
        [1.60, zDashBotRear + 0.075],
        [yDashBotRear, zDashBotRear],
        [yDashTop - 0.016, zDashTopRear - 0.004],
        [yDashTop - 0.004, zDashTopRear + 0.005],
        [yDashTop, zDashTopRear + 0.018],
        [yDashTop, zDashFront]
    ];
    const dashSections = [-wDash, wDash].map(xVal =>
        dashProfileYZ.map(([y, z]) => [xVal, y, z])
    );
    group.add(new THREE.Mesh(createLoftedGeometry(dashSections, true, true, true, 0.45), mats.interiorDark));

    const dxInterior = getNucleoWidthAtLocalZ(1.69) - 0.6739; // Deslocamento lateral acompanhando o alargamento da porta/parede do núcleo
    const yWoodMid = (yDashTop - 0.016 + yDashBotRear) * 0.5;
    const zWoodMid = (zDashTopRear - 0.004 + zDashBotRear) * 0.5;
    const woodCluster = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.18, 0.016), mats.woodgrain);
    woodCluster.position.set(0.16 + dxInterior, yWoodMid, zWoodMid - 0.004);
    woodCluster.rotation.x = dashTiltX;
    group.add(woodCluster);

    // Relógios cromados no painel (velocímetro, contagiros e manômetros) alinhados à nova inclinação do painel
    [0.42, 0.30, 0.18, 0.06].forEach(xGauge => {
        const gaugeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 12), mats.chrome);
        gaugeRing.rotation.x = Math.PI / 2 + dashTiltX;
        gaugeRing.position.set(xGauge + dxInterior, yWoodMid + 0.006, zWoodMid - 0.006);
        group.add(gaugeRing);
    });

    // Coluna de direção e Volante Clássico Kenworth de 4 Raios reposicionados mais à frente junto ao novo painel
    const steerGroup = new THREE.Group();
    steerGroup.position.set(0.34 + dxInterior, 1.89, 1.69);
    steerGroup.rotation.x = -0.72;

    const steerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.036, 0.46, 12), mats.interiorDark);
    steerCol.position.set(0, -0.23, 0);
    steerGroup.add(steerCol);

    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.017, 10, 24), mats.leather);
    wheelRim.rotation.x = Math.PI / 2;
    steerGroup.add(wheelRim);

    const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 14), mats.chrome);
    steerGroup.add(wheelHub);

    [-Math.PI / 5, Math.PI / 5].forEach(angleY => {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.020), mats.chrome);
        spoke.rotation.y = angleY;
        steerGroup.add(spoke);
    });

    group.add(steerGroup);

    // Alavanca de Câmbio Alta Eaton-Fuller 18-Speed reposicionada mais à frente acompanhando o volante e o painel
    const shifterStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.85, 8), mats.chrome);
    shifterStalk.position.set(0.06, 1.36, 1.59);
    shifterStalk.rotation.x = -0.10;
    group.add(shifterStalk);

    const shifterKnob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 10), mats.interiorDark);
    shifterKnob.position.set(0.06, 1.78, 1.55);
    group.add(shifterKnob);

    // Dois Bancos Pneumáticos High-Back em Couro (Motorista e Passageiro)
    [-1, 1].forEach(sideSeat => {
        const xSeat = sideSeat * (0.33 + dxInterior);
        const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.34), mats.interiorDark);
        pedestal.position.set(xSeat, 1.06, 1.38);
        group.add(pedestal);

        const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.12, 0.44, 2, 0.03), mats.leather);
        cushion.position.set(xSeat, 1.26, 1.41);
        group.add(cushion);

        const backrest = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.68, 0.11, 2, 0.03), mats.leather);
        backrest.position.set(xSeat, 1.64, 1.22);
        backrest.rotation.x = -0.10;
        group.add(backrest);

        const headrest = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.22, 0.09, 2, 0.025), mats.leather);
        headrest.position.set(xSeat, 2.04, 1.18);
        group.add(headrest);
    });

    return group;
}

/**
 * Acessórios externos da cabine (maçanetas, barras de apoio grab bars, saia cromada com LEDs e limpadores).
 * Ficam no grupo "Outros" para não poluir a silhueta cônica da Estrutura!
 */
function buildCabExternalAccessories(mats) {
    const group = new THREE.Group();
    const zDoorFront = 1.92;
    const zCabRear = NUCLEO_Z_END_LOCAL; // 0.80
    const yCabBottom = CHASSIS_Y_TOP;    // 0.89
    const yBeltline = HOOD_Y_TOP;        // 1.99
    const zWindBaseCenter = 2.26;
    const coneSlopeAngle = Math.atan2(CONE_W_END - CONE_W_START, HOOD_Z_START - NUCLEO_Z_END_WORLD);

    [-1, 1].forEach(side => {
        const angleY = side * coneSlopeAngle;

        // Maçaneta vertical embutida Kenworth W900 (moldura preta arredondada + alavanca cromada superior-traseira + cilindro de chave inferior)
        const zHandle = 1.26;
        const yHandle = 1.258; // Base alinhada à base da peep window (Y ≈ 1.185m), bem abaixo da faixa dourada
        const wHandle = getNucleoWidthAtLocalZ(zHandle);

        const handleGroup = new THREE.Group();
        handleGroup.position.set(side * wHandle, yHandle, zHandle);
        handleGroup.rotation.y = angleY;

        // 1. Base/fundo escuro da cavidade da maçaneta (mats.interiorDark)
        const hHeight = 0.146;
        const hWidthZ = 0.094;
        const recessBack = new THREE.Mesh(
            new RoundedBoxGeometry(0.010, hHeight - 0.008, hWidthZ - 0.008, 3, 0.014),
            mats.interiorDark
        );
        recessBack.position.set(side * 0.003, 0, 0);
        handleGroup.add(recessBack);

        // 2. Moldura/aro externo preto fosco (mats.rubber) com cantos arredondados contornando a cavidade
        const frameOuterY = hHeight / 2;
        const frameOuterZ = hWidthZ / 2;
        const frameInnerY = frameOuterY - 0.010;
        const frameInnerZ = frameOuterZ - 0.010;
        const buildRoundedRectLoop = (halfY, halfZ, rCorner) => {
            const cPts = [
                [halfY, -halfZ],
                [-halfY, -halfZ],
                [-halfY, halfZ],
                [halfY, halfZ]
            ];
            const steps = 5;
            const out = [];
            for (let c = 0; c < 4; c++) {
                const pPrev = cPts[(c + 3) % 4];
                const pCurr = cPts[c];
                const pNext = cPts[(c + 1) % 4];
                const dy1 = pPrev[0] - pCurr[0], dz1 = pPrev[1] - pCurr[1];
                const l1 = Math.hypot(dy1, dz1) || 1;
                const dy2 = pNext[0] - pCurr[0], dz2 = pNext[1] - pCurr[1];
                const l2 = Math.hypot(dy2, dz2) || 1;
                const sY = pCurr[0] + (dy1 / l1) * rCorner;
                const sZ = pCurr[1] + (dz1 / l1) * rCorner;
                const eY = pCurr[0] + (dy2 / l2) * rCorner;
                const eZ = pCurr[1] + (dz2 / l2) * rCorner;
                for (let k = 0; k <= steps; k++) {
                    const t = k / steps;
                    const omt = 1 - t;
                    out.push([
                        omt * omt * sY + 2 * omt * t * pCurr[0] + t * t * eY,
                        omt * omt * sZ + 2 * omt * t * pCurr[1] + t * t * eZ
                    ]);
                }
            }
            if (side > 0) out.reverse();
            return out;
        };

        const outerRimYZ = buildRoundedRectLoop(frameOuterY, frameOuterZ, 0.018);
        const innerRimYZ = buildRoundedRectLoop(frameInnerY, frameInnerZ, 0.011);
        const mapLocalX = (loop, xVal) => loop.map(([y, z]) => [side * xVal, y, z]);

        const rimWallIn = mapLocalX(outerRimYZ, -0.002);
        const rimOuterFront = mapLocalX(outerRimYZ, 0.012);
        const rimInnerFront = mapLocalX(innerRimYZ, 0.012);
        const rimInnerBack = mapLocalX(innerRimYZ, 0.004);
        handleGroup.add(new THREE.Mesh(
            createLoftedGeometry([rimWallIn, rimOuterFront, rimInnerFront, rimInnerBack, rimWallIn], true, false, false, 0.45),
            mats.rubber
        ));

        // 3. Alavanca vertical cromada (paddle) alojada no quadrante superior-traseiro da moldura
        const paddleZ = -0.015; // Lado traseiro (-Z) da moldura, deixando o vão frontal (+Z) livre para a mão
        const paddleY = 0.016;  // Parte superior da moldura
        const chromePaddle = new THREE.Mesh(
            new RoundedBoxGeometry(0.010, 0.076, 0.036, 2, 0.004),
            mats.chrome
        );
        chromePaddle.position.set(side * 0.010, paddleY, paddleZ);
        handleGroup.add(chromePaddle);

        // 4. Cilindro cromado da fechadura com fenda de chave logo abaixo da alavanca cromada
        const lockY = -0.041;
        const lockCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.010, 16), mats.chrome);
        lockCyl.rotation.z = Math.PI / 2;
        lockCyl.position.set(side * 0.008, lockY, paddleZ);
        handleGroup.add(lockCyl);

        const keyholeSlot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.010, 0.003), mats.interiorDark);
        keyholeSlot.position.set(side * 0.0125, lockY, paddleZ);
        handleGroup.add(keyholeSlot);

        group.add(handleGroup);

        // Limpador de para-brisa articulado (Windshield Wiper) - mantém suas dimensões e acompanha proporcionalmente a largura do para-brisa no núcleo
        const wiperWidthScale = getNucleoWidthAtLocalZ(2.12) / 0.63756;
        const wiperPivot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), mats.chrome);
        wiperPivot.rotation.x = Math.PI / 2;
        wiperPivot.position.set(side * (0.28 * wiperWidthScale), yBeltline + 0.03, zWindBaseCenter - 0.04);
        group.add(wiperPivot);

        const wiperBlade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.016, 0.016), mats.rubber);
        wiperBlade.position.set(side * (0.30 * wiperWidthScale), yBeltline + 0.09, zWindBaseCenter - 0.05);
        wiperBlade.rotation.z = side * 0.14;
        group.add(wiperBlade);
    });

    return group;
}

// ============================================================================
// 7. QUEBRA-SOL INOX BIPARTIDO EM V (FACES PLANAS), LUZES TORPEDO E BUZINAS A AR
// ============================================================================

function buildRoofVisorHornsAndLights(mats) {
    const group = new THREE.Group();

    // Quebra-sol inox bipartido em V com duas faces frontais 100% planas e retas,
    // partindo da borda frontal superior do teto do núcleo e descendo inclinado sobre o topo do para-brisa.
    const zWindTopCenter = 2.14;
    const zWindTopOuter = 2.00;
    const wWindTopOuter = getNucleoWidthAtLocalZ(zWindTopOuter);
    const yRoofEdge = NUCLEO_WINDSHIELD_Y_TOP; // 2.47m (topo do para-brisa)
    const yRoofFront = NUCLEO_ROOF_Y_FRONT;    // 2.70m (parte mais baixa/frontal do teto do núcleo)

    // Largura idêntica em cima e embaixo, sendo 1 cm maior no total (+5 mm = 0.005m de cada lado)
    // do que a largura do núcleo onde o quebra-sol é conectado (em zWindTopOuter = 2.00m).
    const wVisorHalf = wWindTopOuter + 0.005;

    const yTop0 = yRoofFront + 0.002;          // Borda superior do quebra-sol cobrindo 100% da quina frontal do teto (2.702m)
    const zTop0 = zWindTopCenter + 0.022;      // Z frontal no topo central (2.162m)

    // Vetores diretores do plano de cada metade do quebra-sol (face frontal 100% plana e horizontal no topo/base)
    const dY_du = 0.0;                         // Mesma altura do centro às pontas para encaixar sem frestas no teto
    const dZ_du = (zWindTopOuter - zWindTopCenter); // Recuo em V do centro para as laterais (-0.14m)

    const dY_dv = (yRoofEdge - 0.058) - yTop0; // Altura vertical da chapa frontal (~ -0.290m, cobrindo o topo do para-brisa)
    const dZ_dv = 0.145;                       // Projeção frontal (+Z) da borda inferior do quebra-sol (+0.145m)

    const plateT = 0.007; // Espessura da chapa de inox do quebra-sol

    // Construímos cada metade (direita e esquerda) separadamente para garantir o vinco central em V 100% nítido
    [-1, 1].forEach(side => {
        // Avalia um ponto (u, v) exatamente sobre o plano matemático da metade `side` do quebra-sol
        const evalPlane = (u, v) => [
            side * (u * wVisorHalf),
            yTop0 + u * dY_du + v * dY_dv,
            zTop0 + u * dZ_du + v * dZ_dv
        ];

        // Gera uma seção transversal vertical no parâmetro lateral `u` (mesma largura em v=0 e v=1)
        const makePlanarSection = (u) => {
            const [xT, yT, zT] = evalPlane(u, 0.0);
            const [xB, yB, zB] = evalPlane(u, 1.0);
            const zFlangeBack = (zWindTopCenter - 0.025) + u * dZ_du;
            const yFlangeBack = yT + 0.001;

            return [
                [xT, yFlangeBack, zFlangeBack],
                [xT, yT, zT],
                [xB, yB, zB],
                [xB, yB - 0.003, zB - plateT],
                [xT, yT - plateT, zT - plateT],
                [xT, yFlangeBack - plateT, zFlangeBack]
            ];
        };

        // 2 estações coplanares de largura constante (Centro u=0 -> Extremidade lateral u=1 com +5mm além do núcleo)
        const sec0 = makePlanarSection(0.0);
        const sec1 = makePlanarSection(1.0);

        const halfSections = side > 0 ? [sec0, sec1] : [sec1, sec0];
        group.add(new THREE.Mesh(createLoftedGeometry(halfSections, true, true, true, 0.20), mats.chrome));

        // Chapa lateral do quebra-sol (formato em L / bumerangue automotivo com recorte inferior diagonal e aba superior
        // prolongada para trás sobre a lateral do teto do núcleo, fixada por 2 rebites/parafusos laterais)
        const [xTOut, yTOut, zTOut] = evalPlane(1.0, 0.0);
        const [xBOut, yBOut, zBOut] = evalPlane(1.0, 1.0);

        const zTabRearTop = 1.850;
        const yTabRearTop = yTOut;
        const zTabRearBot = 1.835;
        const yTabRearBot = yTOut - 0.044;

        const zWaist = zWindTopOuter - 0.002;
        const yWaist = yTOut - 0.097;

        const zBotTipRear = zBOut - 0.030;
        const yBotTipRear = yBOut;

        const wTabRearTop = Math.max(wVisorHalf, getNucleoWidthAtLocalZ(zTabRearTop) + 0.005);
        const wTabRearBot = Math.max(wVisorHalf, getNucleoWidthAtLocalZ(zTabRearBot) + 0.005);
        const wWaist = Math.max(wVisorHalf, getNucleoWidthAtLocalZ(zWaist) + 0.005);

        const makeWingStation = (wTop, yTopS, zTopS, wBot, yBotS, zBotS) => {
            const xTopOut = side * wTop;
            const xBotOut = side * wBot;
            const xTopIn = xTopOut - side * plateT;
            const xBotIn = xBotOut - side * plateT;
            const pts = [
                [xTopOut, yTopS, zTopS],
                [xBotOut, yBotS, zBotS],
                [xBotIn, yBotS, zBotS],
                [xTopIn, yTopS, zTopS]
            ];
            if (side > 0) pts.reverse();
            return pts;
        };

        const wingSections = [
            // Estação 0: Extremidade traseira chanfrada da aba superior de fixação
            makeWingStation(wTabRearTop, yTabRearTop, zTabRearTop, wTabRearBot, yTabRearBot, zTabRearBot),
            // Estação 1: Quina superior frontal e pescoço interno (recorte côncavo)
            makeWingStation(wVisorHalf, yTOut, zTOut, wWaist, yWaist, zWaist),
            // Estação 2: Ponta inferior frontal da chapa lateral
            makeWingStation(wVisorHalf, yBOut, zBOut, wVisorHalf, yBotTipRear, zBotTipRear)
        ];
        group.add(new THREE.Mesh(createLoftedGeometry(wingSections, true, true, true, 0.20), mats.chrome));

        // 2 Parafusos / rebites cromados de fixação na aba lateral superior do quebra-sol
        const sideRivetGeo = new THREE.SphereGeometry(0.0065, 10, 8);
        [
            { t: 0.25, v: 0.48 },
            { t: 0.62, v: 0.40 }
        ].forEach(({ t, v }) => {
            const yTopAtT = THREE.MathUtils.lerp(yTabRearTop, yTOut, t);
            const zTopAtT = THREE.MathUtils.lerp(zTabRearTop, zTOut, t);
            const wTopAtT = THREE.MathUtils.lerp(wTabRearTop, wVisorHalf, t);

            const yBotAtT = THREE.MathUtils.lerp(yTabRearBot, yWaist, t);
            const zBotAtT = THREE.MathUtils.lerp(zTabRearBot, zWaist, t);
            const wBotAtT = THREE.MathUtils.lerp(wTabRearBot, wWaist, t);

            const rY = THREE.MathUtils.lerp(yTopAtT, yBotAtT, v);
            const rZ = THREE.MathUtils.lerp(zTopAtT, zBotAtT, v);
            const rW = THREE.MathUtils.lerp(wTopAtT, wBotAtT, v);

            const sideRivet = new THREE.Mesh(sideRivetGeo, mats.chrome);
            sideRivet.scale.set(0.65, 1, 1);
            sideRivet.position.set(side * (rW + 0.002), rY, rZ);
            group.add(sideRivet);
        });

        // Duas fileiras horizontais de rebites cromados sobre a face frontal plana do quebra-sol (4 pares por metade)
        const rivetGeo = new THREE.SphereGeometry(0.0055, 8, 6);
        [0.06, 0.36, 0.66, 0.93].forEach(u => {
            [0.32, 0.68].forEach(v => {
                const [rX, rY, rZ] = evalPlane(u, v);
                const rivet = new THREE.Mesh(rivetGeo, mats.chrome);
                rivet.scale.set(1, 1, 0.6);
                rivet.position.set(rX, rY + 0.002, rZ + 0.003);
                group.add(rivet);
            });
        });
    });

    // Ângulo de inclinação contínua do teto do núcleo (de Y=2.70m em Z=2.14 até Y=2.93m em Z=1.03)
    const roofPitch = Math.atan2(NUCLEO_Y_TOP - NUCLEO_ROOF_Y_FRONT, 2.14 - NUCLEO_Z_END_LOCAL);
    const cosPitch = Math.cos(roofPitch);
    const sinPitch = Math.sin(roofPitch);

    // Subida real da superfície do teto (incluindo o caimento lateral da coroa do teto)
    const getActualRoofSurfaceY = (z, x) => {
        const wAtZ = getNucleoWidthAtLocalZ(z);
        const uAbs = THREE.MathUtils.clamp(Math.abs(x) / wAtZ, 0, 1);
        const tNorm = Math.min(1.0, uAbs / 0.80);
        return getNucleoRoofHeightAtZ(z, x) - 0.012 * (tNorm * tNorm);
    };

    // Helper para gerar a seção transversal com vinco central superior das lâmpadas aerodinâmicas de teto
    // (sentido anti-horário no plano XY visto de +Z, garantindo normais 100% voltadas para fora quando Z cresce)
    const makeMarkerLampRing = (z, wHalf, yBot, ySide, yCrown) => {
        const yMid = (yBot + ySide) * 0.52;
        return [
            [ wHalf * 0.94, yBot,   z],
            [ wHalf,        yMid,   z],
            [ wHalf * 0.86, ySide,  z],
            [ 0.0,          yCrown, z],
            [-wHalf * 0.86, ySide,  z],
            [-wHalf,        yMid,   z],
            [-wHalf * 0.94, yBot,   z],
            [ 0.0,          yBot,   z]
        ];
    };

    // 5 Luzes de Teto Aerodinâmicas Bicolores (mantêm suas dimensões e são redistribuídas proporcionalmente à nova largura do teto do núcleo)
    const roofLightScale = wWindTopOuter / 0.6477385;
    [-0.555 * roofLightScale, -0.135 * roofLightScale, 0.0, 0.135 * roofLightScale, 0.555 * roofLightScale].forEach(xLight => {
        const uVisor = Math.min(1.0, Math.abs(xLight) / wVisorHalf);
        const zLight = 2.048 - uVisor * 0.130;
        const yRoofSurf = getActualRoofSurfaceY(zLight, xLight);
        const lateralTiltZ = -Math.sign(xLight) * (Math.abs(xLight) > 0.35 ? 0.09 : 0.025 * Math.abs(xLight));

        const lightGroup = new THREE.Group();
        lightGroup.position.set(xLight, yRoofSurf - 0.002, zLight);
        lightGroup.rotation.order = 'YXZ';
        lightGroup.rotation.x = roofPitch;
        lightGroup.rotation.z = lateralTiltZ;

        // 1. Junta/base de borracha preta contornando toda a gota no teto (de Z=-0.068m até Z=+0.058m)
        const gasketSections = [
            makeMarkerLampRing(-0.068, 0.0155, 0.000, 0.0040, 0.0042),
            makeMarkerLampRing(-0.035, 0.0225, 0.000, 0.0040, 0.0042),
            makeMarkerLampRing( 0.000, 0.0252, 0.000, 0.0040, 0.0042),
            makeMarkerLampRing( 0.035, 0.0235, 0.000, 0.0040, 0.0042),
            makeMarkerLampRing( 0.056, 0.0185, 0.000, 0.0040, 0.0042),
            makeMarkerLampRing( 0.060, 0.0135, 0.000, 0.0038, 0.0040)
        ];
        lightGroup.add(new THREE.Mesh(createLoftedGeometry(gasketSections, true, true, true, 0.45), mats.rubber));

        // 2. Base/Bandeja Inferior Cromada Contínua (vai da traseira até a ponta frontal sob a lente laranja)
        const chromeTraySections = [
            makeMarkerLampRing(-0.067, 0.0150, 0.0035, 0.0085, 0.0090),
            makeMarkerLampRing(-0.035, 0.0220, 0.0035, 0.0088, 0.0092),
            makeMarkerLampRing( 0.000, 0.0248, 0.0035, 0.0090, 0.0095),
            makeMarkerLampRing( 0.035, 0.0230, 0.0035, 0.0088, 0.0092),
            makeMarkerLampRing( 0.055, 0.0180, 0.0035, 0.0085, 0.0088),
            makeMarkerLampRing( 0.059, 0.0130, 0.0035, 0.0080, 0.0082)
        ];
        lightGroup.add(new THREE.Mesh(createLoftedGeometry(chromeTraySections, true, true, true, 0.45), mats.chrome));

        // 3. Carenagem Traseira Cromada em Gota com Vinco Central (cobre a metade traseira e desce em diagonal na divisão central)
        const chromeHoodSections = [
            makeMarkerLampRing(-0.067, 0.0148, 0.0040, 0.0095, 0.0115),
            makeMarkerLampRing(-0.052, 0.0188, 0.0040, 0.0150, 0.0185),
            makeMarkerLampRing(-0.030, 0.0225, 0.0040, 0.0210, 0.0265),
            makeMarkerLampRing(-0.010, 0.0244, 0.0040, 0.0250, 0.0315),
            makeMarkerLampRing(-0.002, 0.0246, 0.0040, 0.0258, 0.0326),
            // Corte frontal levemente inclinado onde encaixa a lente laranja
            makeMarkerLampRing( 0.004, 0.0242, 0.0040, 0.0095, 0.0105)
        ];
        lightGroup.add(new THREE.Mesh(createLoftedGeometry(chromeHoodSections, true, true, true, 0.48), mats.chrome));

        // 4. Lente Frontal Âmbar/Laranja Esculpida (apagada por padrão com textura estriada; acende com a tecla 'l')
        const amberLensSections = [
            makeMarkerLampRing(-0.002, 0.0243, 0.0082, 0.0255, 0.0322),
            makeMarkerLampRing( 0.004, 0.0244, 0.0082, 0.0252, 0.0318),
            makeMarkerLampRing( 0.020, 0.0238, 0.0082, 0.0228, 0.0285),
            makeMarkerLampRing( 0.038, 0.0222, 0.0082, 0.0188, 0.0232),
            makeMarkerLampRing( 0.052, 0.0182, 0.0082, 0.0142, 0.0168),
            makeMarkerLampRing( 0.057, 0.0132, 0.0082, 0.0105, 0.0120)
        ];
        const roofLensGeo = createLoftedGeometry(amberLensSections, true, true, true, 0.48);
        const rlPos = roofLensGeo.attributes.position;
        const rlUv = roofLensGeo.attributes.uv;
        for (let vi = 0; vi < rlPos.count; vi++) {
            rlUv.setXY(
                vi,
                THREE.MathUtils.clamp(0.5 + rlPos.getX(vi) / 0.049, 0, 1),
                THREE.MathUtils.clamp((rlPos.getZ(vi) + 0.002) / 0.059, 0, 1)
            );
        }
        rlUv.needsUpdate = true;
        lightGroup.add(new THREE.Mesh(roofLensGeo, mats.amberMarkerLens));

        // Pequeno detalhe/parafuso cromado lateral na junção entre a lente âmbar e a carenagem cromada
        [-1, 1].forEach(sSide => {
            const sidePin = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), mats.chrome);
            sidePin.position.set(sSide * 0.0242, 0.011, 0.003);
            lightGroup.add(sidePin);
        });

        group.add(lightGroup);
    });

    // 2 Buzinas a Ar Cromadas Longas (Hadley Rectangular Bell) fiéis às fotos de detalhe:
    // - Base traseira piramidal/facetada com diafragma traseiro assentada no teto
    // - Cano bem fino (diâmetro ~1.9cm) saindo da base e indo até perto do retângulo frontal
    // - Expansão cônica/exponencial côncava perto da frente abrindo até a dimensão do retângulo frontal
    // - Campana retangular frontal com placa defletora cromada, retângulo escuro central, fendas laterais e 2 rebites
    const hornRingSegs = 28;
    const makeHornSectionRing = (xCenter, yCenter, zCenter, halfW, halfH, rectBlend) => {
        const ring = [];
        // Expoente da superelipse: n=2 (círculo perfeito no cano fino) -> n=8.5 (retângulo bem definido na frente)
        const exp = THREE.MathUtils.lerp(2.0, 8.5, rectBlend);
        for (let j = 0; j < hornRingSegs; j++) {
            const phi = (j / hornRingSegs) * Math.PI * 2;
            const c = Math.cos(phi);
            const s = Math.sin(phi);
            const ux = Math.sign(c) * Math.pow(Math.abs(c), 2 / exp);
            const uy = Math.sign(s) * Math.pow(Math.abs(s), 2 / exp);
            const dy = halfH * uy;
            ring.push([
                xCenter + halfW * ux,
                yCenter + dy * cosPitch,
                zCenter + dy * sinPitch
            ]);
        }
        return ring;
    };

    // Redistribui proporcionalmente as 2 buzinas a ar de acordo com a largura do teto do núcleo na região de fixação
    // Comprimento reduzido em 20% (× 0.80) e largura/altura do retângulo frontal aumentadas em 20% (× 1.20)
    const roofHornScale = getNucleoWidthAtLocalZ(1.64) / 0.6782685;
    const hornLenScale = 0.80;
    const hornZCenterRef = 1.6425;
    const mapHornZ = (zOrig) => hornZCenterRef + (zOrig - hornZCenterRef) * hornLenScale;
    const bellFaceScale = 1.20;

    [-0.385 * roofHornScale, 0.385 * roofHornScale].forEach(xHorn => {
        const hornAxisY = (z) => getActualRoofSurfaceY(z, xHorn) + 0.043;

        // 1. Base Traseira Piramidal/Facetada Cromada com Diafragma (Z ≈ 1.34m após redução de 20% no comprimento)
        const zBaseCenter = mapHornZ(1.265);
        const yRoofBase = getActualRoofSurfaceY(zBaseCenter, xHorn);
        const yAxisBase = hornAxisY(zBaseCenter);

        const rearBaseGroup = new THREE.Group();
        rearBaseGroup.position.set(xHorn, yRoofBase, zBaseCenter);
        rearBaseGroup.rotation.x = roofPitch;

        // Cunha/junta de borracha preta sob a base traseira
        const rubberPad = new THREE.Mesh(
            new RoundedBoxGeometry(0.076, 0.008, 0.056 * hornLenScale, 2, 0.003),
            mats.rubber
        );
        rubberPad.position.set(0, 0.002, 0);
        rearBaseGroup.add(rubberPad);

        // Sapata piramidal cromada chanfrada (larga embaixo como um retângulo, subindo em pirâmide até o bloco central)
        const hFlange = Math.max(0.024, (yAxisBase - yRoofBase) - 0.004);
        const makeRectSectionXZ = (wHalf, zHalf, yVal) => [
            [-wHalf, yVal, -zHalf],
            [-wHalf, yVal,  zHalf],
            [ wHalf, yVal,  zHalf],
            [ wHalf, yVal, -zHalf]
        ];
        const pyramidFlangeSections = [
            makeRectSectionXZ(0.037, 0.026 * hornLenScale, 0.005),
            makeRectSectionXZ(0.037, 0.026 * hornLenScale, 0.011),
            makeRectSectionXZ(0.017, 0.019 * hornLenScale, hFlange)
        ];
        rearBaseGroup.add(new THREE.Mesh(
            createLoftedGeometry(pyramidFlangeSections, true, true, true, 0.25),
            mats.chrome
        ));

        // Bloco central superior e câmara circular traseira do diafragma com nervuras
        const yLocalAxis = yAxisBase - yRoofBase;
        const driverTower = new THREE.Mesh(
            new RoundedBoxGeometry(0.032, 0.034, 0.044 * hornLenScale, 2, 0.004),
            mats.chrome
        );
        driverTower.position.set(0, yLocalAxis, 0);
        rearBaseGroup.add(driverTower);

        const diaphragmCap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.020, 0.022, 0.014 * hornLenScale, 16),
            mats.chrome
        );
        diaphragmCap.rotation.x = Math.PI / 2;
        diaphragmCap.position.set(0, yLocalAxis + 0.003, -0.024 * hornLenScale);
        rearBaseGroup.add(diaphragmCap);

        // Colar quadrado/chanfrado frontal de onde sai o cano bem fino
        const nozzleCollar = new THREE.Mesh(
            new RoundedBoxGeometry(0.022, 0.022, 0.012 * hornLenScale, 2, 0.003),
            mats.chrome
        );
        nozzleCollar.position.set(0, yLocalAxis, 0.024 * hornLenScale);
        rearBaseGroup.add(nozzleCollar);

        group.add(rearBaseGroup);

        // 2. Cano Bem Fino + Expansão Cônica + Campana Retangular Frontal (comprimento reduzido em 20%, retângulo frontal +20% em largura e altura)
        const hornProfile = [
            { z: mapHornZ(1.285), w: 0.0090, h: 0.0090, rect: 0.00 }, // Saída bem fina da base traseira (diâmetro 1.8cm)
            { z: mapHornZ(1.500), w: 0.0096, h: 0.0096, rect: 0.00 }, // Trecho reto do cano fino
            { z: mapHornZ(1.720), w: 0.0103, h: 0.0103, rect: 0.00 }, // Trecho reto do cano fino
            { z: mapHornZ(1.902), w: 0.0110, h: 0.0110, rect: 0.00 }, // Fim do cano fino antes do anel de junção
            { z: mapHornZ(1.906), w: 0.0124, h: 0.0124, rect: 0.00 }, // Anel/colar de junção onde começa o cone
            { z: mapHornZ(1.911), w: 0.0115, h: 0.0115, rect: 0.05 }  // Início da expansão cônica
        ];

        // Expansão cônica/exponencial côncava abrindo até as dimensões 20% maiores do retângulo frontal
        const zFlareStart = mapHornZ(1.911);
        const zFlareEnd = mapHornZ(1.986);
        const wBellHalf = 0.064 * bellFaceScale; // Largura do retângulo frontal aumentada em +20% (15.36cm total)
        const hBellHalf = 0.029 * bellFaceScale; // Altura do retângulo frontal aumentada em +20% (6.96cm total)
        const flareSteps = 10;
        for (let i = 1; i <= flareSteps; i++) {
            const s = i / flareSteps;
            const z = THREE.MathUtils.lerp(zFlareStart, zFlareEnd, s);
            // Curva exponencial côncava de corneta abrindo até as dimensões exatas do retângulo frontal
            const w = THREE.MathUtils.lerp(0.0115, wBellHalf, Math.pow(s, 2.20));
            const h = THREE.MathUtils.lerp(0.0115, hBellHalf, Math.pow(s, 2.00));
            const rect = THREE.MathUtils.smoothstep(s, 0.0, 0.90);
            hornProfile.push({ z, w, h, rect });
        }

        // Caixa/colar retangular frontal na ponta da corneta
        hornProfile.push(
            { z: mapHornZ(1.990), w: wBellHalf + 0.002, h: hBellHalf + 0.002, rect: 1.00 },
            { z: mapHornZ(2.018), w: wBellHalf + 0.002, h: hBellHalf + 0.002, rect: 1.00 },
            { z: mapHornZ(2.020), w: wBellHalf - 0.003, h: hBellHalf - 0.003, rect: 1.00 }
        );

        const hornSections = hornProfile.map(st =>
            makeHornSectionRing(xHorn, hornAxisY(st.z), st.z, st.w, st.h, st.rect)
        );
        group.add(new THREE.Mesh(createLoftedGeometry(hornSections, true, true, false, 0.45), mats.chrome));

        // 3. Interior Escuro da Boca Retangular + Face Frontal Cromada Lisa (+20% em largura e altura)
        const zMouthFront = mapHornZ(2.018);
        const yMouthFront = hornAxisY(zMouthFront);
        const mouthGroup = new THREE.Group();
        mouthGroup.position.set(xHorn, yMouthFront, zMouthFront);
        mouthGroup.rotation.x = roofPitch;

        // Fundo preto recuado (cria as fendas escuras laterais de saída de som ao redor da placa defletora)
        const darkCavity = new THREE.Mesh(
            new THREE.BoxGeometry(wBellHalf * 1.92, hBellHalf * 1.84, 0.016),
            mats.interiorDark
        );
        darkCavity.position.set(0, 0, -0.007);
        mouthGroup.add(darkCavity);

        // Placa defletora frontal 100% cromada e lisa (sem retângulo preto), levemente abaulada nas bordas
        const shieldPlate = new THREE.Mesh(
            new RoundedBoxGeometry(wBellHalf * 1.74, hBellHalf * 1.70, 0.009, 3, 0.004),
            mats.chrome
        );
        shieldPlate.position.set(0, 0, 0.001);
        mouthGroup.add(shieldPlate);

        // Relevo central retangular sutil também em cromo liso + 2 pequenos parafusos cromados (+20%)
        const centerChromeEmboss = new THREE.Mesh(
            new RoundedBoxGeometry(0.056 * bellFaceScale, 0.022 * bellFaceScale, 0.004, 2, 0.002),
            mats.chrome
        );
        centerChromeEmboss.position.set(0, 0, 0.004);
        mouthGroup.add(centerChromeEmboss);

        [-0.041 * bellFaceScale, 0.041 * bellFaceScale].forEach(dxRivet => {
            const frontScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.005, 10), mats.chrome);
            frontScrew.rotation.x = Math.PI / 2;
            frontScrew.position.set(dxRivet, 0, 0.0045);
            mouthGroup.add(frontScrew);
        });

        group.add(mouthGroup);

        // 4. Suporte Frontal Fino com Abraçadeira Circular no Cano Fino (logo antes da abertura cônica)
        const zFrontClamp = mapHornZ(1.890);
        const ySurfFront = getActualRoofSurfaceY(zFrontClamp, xHorn);
        const yTubeFront = hornAxisY(zFrontClamp);
        const hStem = Math.max(0.018, yTubeFront - ySurfFront);

        const clampRing = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0022, 8, 18), mats.chrome);
        clampRing.position.set(xHorn, yTubeFront, zFrontClamp);
        clampRing.rotation.x = roofPitch;
        group.add(clampRing);

        const frontStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0065, hStem, 10), mats.chrome);
        frontStem.position.set(xHorn, (ySurfFront + yTubeFront) * 0.5, zFrontClamp);
        frontStem.rotation.x = roofPitch * 0.5;
        group.add(frontStem);

        const frontFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.006, 12), mats.rubber);
        frontFoot.position.set(xHorn, ySurfFront + 0.001, zFrontClamp);
        frontFoot.rotation.x = roofPitch;
        group.add(frontFoot);
    });

    return group;
}

// ============================================================================
// 8. RETROVISORES "WEST COAST" AUTÊNTICOS W900L + ESTRUTURA TUBULAR COMPLETA
// ============================================================================

function buildAuthenticMirrors(mats, zShift = 0) {
    const group = new THREE.Group();

    // Helper para criar tubos contínuos de inox com dobras curvas suaves (90° ou anguladas) usando QuadraticBezierCurve3
    const addBentTube = (pts, radius = 0.0105, bendRadius = 0.036, tubularSegments = 36) => {
        const vectors = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        if (vectors.length === 2) {
            const dist = vectors[0].distanceTo(vectors[1]);
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dist, 10), mats.chrome);
            cyl.position.copy(vectors[0]).add(vectors[1]).multiplyScalar(0.5);
            cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vectors[1].clone().sub(vectors[0]).normalize());
            group.add(cyl);
            return;
        }

        const path = new THREE.CurvePath();
        let currStart = vectors[0];

        for (let i = 1; i < vectors.length - 1; i++) {
            const pPrev = vectors[i - 1];
            const pCorner = vectors[i];
            const pNext = vectors[i + 1];

            const vIn = pCorner.clone().sub(pPrev);
            const vOut = pNext.clone().sub(pCorner);
            const lenIn = vIn.length();
            const lenOut = vOut.length();
            const r = Math.min(bendRadius, lenIn * 0.45, lenOut * 0.45);

            const pCurveStart = pCorner.clone().sub(vIn.normalize().multiplyScalar(r));
            const pCurveEnd = pCorner.clone().add(vOut.normalize().multiplyScalar(r));

            if (currStart.distanceTo(pCurveStart) > 1e-4) {
                path.add(new THREE.LineCurve3(currStart, pCurveStart));
            }
            path.add(new THREE.QuadraticBezierCurve3(pCurveStart, pCorner, pCurveEnd));
            currStart = pCurveEnd;
        }

        const pLast = vectors[vectors.length - 1];
        if (currStart.distanceTo(pLast) > 1e-4) {
            path.add(new THREE.LineCurve3(currStart, pLast));
        }

        const tubeGeo = new THREE.TubeGeometry(path, tubularSegments, radius, 10, false);
        group.add(new THREE.Mesh(tubeGeo, mats.chrome));
    };

    // Helper para adicionar abraçadeiras/grampos e suportes (clevis mounts) de fixação dos tubos
    const addClampBlock = (x, y, z, sx = 0.026, sy = 0.026, sz = 0.030) => {
        const clamp = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 2, 0.004), mats.chrome);
        clamp.position.set(x, y, z);
        group.add(clamp);
    };

    [-1, 1].forEach(side => {
        // Coordenadas longitudinais (Z) alinhadas à frente da janela da porta
        const zBotMount = 2.125 + zShift;       // Ponto único de fixação inferior alinhado diretamente abaixo da base da coluna A (Plano vertical P2)
        const zMirror = zBotMount;              // Plano P2 perpendicular a P1 que corta o ponto de fixação inferior e todas as três hastes restantes
        const zTopMount1 = 1.97 + zShift;       // 1º ponto de fixação superior (frontal, junto ao canto superior frontal da janela / topo da coluna A)

        const yTopMounts = 2.495 + 0.03;        // 2.525m (duas bases de fixação superiores na cabine movidas 3 cm para cima)
        const yTop = 2.495;                     // Altura do nó superior da alça externa
        const yBot = 1.935;                     // Altura da haste inferior reta (na faixa vermelha diretamente abaixo da base da coluna A)

        const wCabTop1 = getNucleoWidthAtLocalZ(1.97);
        const wCabBot = getNucleoWidthAtLocalZ(2.125);

        // Desloca a estrutura externa do retrovisor pela expansão lateral do núcleo em zTopMount1 (1.97m):
        // - Nenhum ângulo (nem da cabeça do espelho nem de qualquer uma das hastes) muda!
        // - A haste frontal superior e a haste diagonal mantêm 100% seus ângulos e comprimentos originais até [xDoorTop1, yTopMounts, zTopMount1].
        // - A haste horizontal inferior (0° no eixo X) aumenta de comprimento até tocar a parede do núcleo em xDoorBot (z = 2.125m).
        // - A haste horizontal superior traseira mantém exatamente seu vetor diretor/ângulo original e reduz seu comprimento (fator sRear)
        //   para encontrar a parede lateral mais inclinada do núcleo em [xDoorTop2, yTopMount2, zTopMount2].
        const dxMirror = wCabTop1 - 0.650283;
        const absJointTop = 0.955 + dxMirror;
        const xOuter = side * (1.135 + dxMirror);    // Coluna vertical externa da alça em U (centro do retrovisor principal)
        const xJointTop = side * absJointTop;        // Nó superior (destacado em verde)
        const xJointBot = xJointTop;                 // Nó inferior (destacado em amarelo) com a mesma coordenada X do nó superior
        const zJointBot = zBotMount;

        const coneSlope = (CONE_W_END - CONE_W_START) / (HOOD_Z_START - NUCLEO_Z_END_WORLD);
        const origRearDX = 0.284972; // 0.955 - (0.674028 - 0.004)
        const origRearDZ = 0.435;    // 2.125 - 1.69
        const sRear = (absJointTop - (wCabBot - 0.004)) / (origRearDX + coneSlope * origRearDZ);
        const zTopMount2 = zBotMount - sRear * origRearDZ;
        const yTopMount2 = yTop + sRear * (yTopMounts - yTop);
        const wCabTop2 = getNucleoWidthAtLocalZ(zTopMount2 - zShift);

        const xDoorTop1 = side * (wCabTop1 - 0.004);
        const xDoorTop2 = side * (wCabTop2 - 0.004);
        const xDoorBot = side * (wCabBot - 0.004);

        // 1. Alça Principal Contínua em U (Main West Coast C-Loop):
        // Sai em linha 100% reta do ponto único de fixação inferior (abaixo da coluna A) até o canto inferior externo (dobra 90°)
        // -> sobe pela coluna vertical externa -> dobra 90° no topo -> vai até o nó superior xJointTop (todos em Z = zBotMount)
        addBentTube([
            [xDoorBot, yBot, zBotMount],
            [xOuter, yBot, zBotMount],
            [xOuter, yTop, zBotMount],
            [xJointTop, yTop, zBotMount]
        ], 0.0105, 0.038, 36);

        // 2. Haste Vertical Interna (do nó inferior [xJointBot, yBot, zBotMount] até o nó superior [xJointTop, yTop, zBotMount])
        addBentTube([
            [xJointBot, yBot, zBotMount],
            [xJointTop, yTop, zBotMount]
        ], 0.0095, 0.02, 8);

        // 3. Haste Diagonal ligando o nó inferior [xJointBot, yBot, zBotMount] (amarelo) ao 1º ponto de fixação superior na cabine [xDoorTop1, yTopMounts, zTopMount1] (rosa)
        addBentTube([
            [xJointBot, yBot, zBotMount],
            [xDoorTop1, yTopMounts, zTopMount1]
        ], 0.0095, 0.02, 8);

        // 4. Duas hastes superiores horizontais ligando o nó superior [xJointTop, yTop, zBotMount] aos dois pontos de fixação superiores na cabine
        addBentTube([
            [xJointTop, yTop, zBotMount],
            [xDoorTop1, yTopMounts, zTopMount1]
        ], 0.0095, 0.02, 8);

        addBentTube([
            [xJointTop, yTop, zBotMount],
            [xDoorTop2, yTopMount2, zTopMount2]
        ], 0.0095, 0.02, 8);

        // Pontos de fixação superiores na cabine + ponto inferior e nós
        addClampBlock(xDoorTop1, yTopMounts, zTopMount1, 0.024, 0.036, 0.034);
        addClampBlock(xDoorTop2, yTopMount2, zTopMount2, 0.024, 0.036, 0.034);
        addClampBlock(xDoorBot, yBot, zBotMount, 0.024, 0.038, 0.034);
        addClampBlock(xJointTop, yTop, zBotMount, 0.030, 0.028, 0.032);
        addClampBlock(xJointBot, yBot, zBotMount, 0.030, 0.028, 0.032);

        // 6. Caixa Principal do Retrovisor "West Coast" em Inox (aumentada 17% para baixo, mantendo o topo em Y = 2.4325m)
        const headX = xOuter;
        const headW = 0.182;
        const headH = 0.375 * 1.17;             // 0.43875m (+17% de altura)
        const headY = 2.4325 - headH / 2;       // 2.213125m (cresce 100% para baixo)
        const headD = 0.038;
        const headRotY = side * 0.14;

        const headGroup = new THREE.Group();
        headGroup.position.set(headX, headY, zBotMount);
        headGroup.rotation.y = headRotY;

        const headShell = new THREE.Mesh(new RoundedBoxGeometry(headW, headH, headD, 2, 0.012), mats.chrome);
        headGroup.add(headShell);

        // Nervura vertical central estampada na face frontal inox do retrovisor (envolvendo a haste vertical em Z = zBotMount)
        const centerRib = new THREE.Mesh(new RoundedBoxGeometry(0.034, headH + 0.006, headD + 0.008, 2, 0.008), mats.chrome);
        centerRib.position.set(0, 0, 0);
        headGroup.add(centerRib);

        // Moldura preta de borracha + espelho refletivo na face traseira (voltada para o motorista)
        const mirrorRubberFrame = new THREE.Mesh(new THREE.BoxGeometry(headW - 0.012, headH - 0.014, 0.006), mats.rubber);
        mirrorRubberFrame.position.set(0, 0, -headD / 2 - 0.001);
        headGroup.add(mirrorRubberFrame);

        const mirrorFace = new THREE.Mesh(new THREE.PlaneGeometry(headW - 0.024, headH - 0.026), mats.chrome);
        mirrorFace.position.set(0, 0, -headD / 2 - 0.005);
        mirrorFace.rotation.y = Math.PI;
        headGroup.add(mirrorFace);

        group.add(headGroup);

        // Grampos superior e inferior que prendem a caixa do retrovisor à coluna vertical da alça em U (em Z = zBotMount)
        [-headH / 2 - 0.008, headH / 2 + 0.008].forEach(dyClamp => {
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.022, 10), mats.chrome);
            collar.position.set(headX, headY + dyClamp, zBotMount);
            group.add(collar);
        });

        // 7. Espelho Redondo Inferior Plano (8" Spot Mirror) com acabamento preto e face 100% plana como o retrovisor retangular acima
        const spotR = 0.086;
        const spotY = yBot - 0.050;             // 1.885m (topo em 1.971m, logo abaixo do colar inferior do espelho retangular)
        const spotZ = zBotMount - 0.018;

        const spotGroup = new THREE.Group();
        spotGroup.position.set(headX, spotY, spotZ);
        spotGroup.rotation.y = headRotY;

        // Semiesfera traseira/frontal ("costas") cromada voltada apenas para +Z (z >= 0, sem nunca invadir a face plana traseira -Z)
        const spotDomeGeo = new THREE.SphereGeometry(spotR, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        spotDomeGeo.rotateX(Math.PI / 2);
        spotDomeGeo.scale(1, 1, 0.38);
        const spotHousing = new THREE.Mesh(spotDomeGeo, mats.chrome);
        spotGroup.add(spotHousing);

        // Aro externo cromado envolvente
        const spotRimGeo = new THREE.CylinderGeometry(spotR, spotR, 0.012, 28);
        spotRimGeo.rotateX(Math.PI / 2);
        const spotRim = new THREE.Mesh(spotRimGeo, mats.chrome);
        spotRim.position.set(0, 0, -0.004);
        spotGroup.add(spotRim);

        // Moldura/acabamento preto de borracha na face traseira (-Z), igual ao do retrovisor retangular acima
        const spotRubberGeo = new THREE.CylinderGeometry(spotR - 0.004, spotR - 0.004, 0.006, 28);
        spotRubberGeo.rotateX(Math.PI / 2);
        const spotRubberFrame = new THREE.Mesh(spotRubberGeo, mats.rubber);
        spotRubberFrame.position.set(0, 0, -0.008);
        spotGroup.add(spotRubberFrame);

        // Espelho circular 100% plano na face traseira (voltada para o motorista)
        const spotFace = new THREE.Mesh(new THREE.CircleGeometry(spotR - 0.011, 28), mats.chrome);
        spotFace.position.set(0, 0, -0.012);
        spotFace.rotation.y = Math.PI;
        spotGroup.add(spotFace);

        group.add(spotGroup);

        // Grampo inferior no canto da alça em U / espelho redondo exatamente na mesma coordenada Z = zBotMount
        addClampBlock(headX, yBot, zBotMount, 0.026, 0.036, 0.028);
    });

    return group;
}

// ============================================================================
// 9. FILTROS DE AR EXTERNOS "VORTOX" INOX NO COWL COM COTOVELOS E LEDS
// ============================================================================

function buildVortoxAirCleaners(
    mats,
    filtroParams = DEFAULT_CABIN_ELEMENTS_PARAMS.filtroArEsquerdo,
    shroudParams = DEFAULT_CABIN_ELEMENTS_PARAMS.chapaTuboFiltroAr
) {
    const group = new THREE.Group();

    const fCfg = filtroParams || DEFAULT_CABIN_ELEMENTS_PARAMS.filtroArEsquerdo;
    const sCfg = shroudParams || DEFAULT_CABIN_ELEMENTS_PARAMS.chapaTuboFiltroAr;
    const zFilter = fCfg.posZ;
    const yCenter = fCfg.posY;
    const xFilter = fCfg.posX;
    // Referência geométrica base da malha não-transformada (acompanhando o deslocamento lateral xFilter - 0.795 para que a chapa mude apenas a posição em X)
    const defShroud = {
        posX: 0.781 + (xFilter - 0.795),
        posY: 1.690,
        posZ: 2.625,
        dimX: 0.225,
        dimY: 0.345,
        dimZ: 0.215
    };
    const canH = Math.max(0.10, fCfg.dimY);
    const baseR = 0.165;
    const scaleX = Math.max(0.10, fCfg.dimX) / (baseR * 2);
    const scaleZ = Math.max(0.10, fCfg.dimZ) / (baseR * 2);
    const scaleY = canH / 0.78;

    [-1, 1].forEach(side => {
        const x = side * xFilter;
        const rX = baseR * scaleX;
        const rZ = baseR * scaleZ;

        // 1. Corpo cilíndrico principal cromado + faixa superior perfurada de admissão de ar (como nas fotos)
        const screenH = 0.115 * scaleY;
        const lowerBodyH = canH - screenH;
        const canister = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR, lowerBodyH, 28), mats.chrome);
        canister.scale.set(scaleX, 1, scaleZ);
        canister.position.set(x, yCenter - screenH / 2, zFilter);
        group.add(canister);

        const topScreenBand = new THREE.Mesh(new THREE.CylinderGeometry(baseR - 0.001, baseR - 0.001, screenH, 28), mats.heatShield);
        topScreenBand.scale.set(scaleX, 1, scaleZ);
        topScreenBand.position.set(x, yCenter + canH / 2 - screenH / 2 - 0.008, zFilter);
        group.add(topScreenBand);

        // Anel cromado frisado separando o corpo liso da tela perfurada superior
        const midBeadRing = new THREE.Mesh(new THREE.CylinderGeometry(baseR + 0.005, baseR + 0.005, 0.016 * scaleY, 28), mats.chrome);
        midBeadRing.scale.set(scaleX, 1, scaleZ);
        midBeadRing.position.set(x, yCenter + canH / 2 - screenH - 0.006, zFilter);
        group.add(midBeadRing);

        // Tampa superior plana cromada com borda frisada e parafuso central
        const topFlatLid = new THREE.Mesh(new THREE.CylinderGeometry(baseR + 0.007, baseR + 0.007, 0.024, 28), mats.chrome);
        topFlatLid.scale.set(scaleX, 1, scaleZ);
        topFlatLid.position.set(x, yCenter + canH / 2 - 0.004, zFilter);
        group.add(topFlatLid);

        const topCenterBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 8), mats.chrome);
        topCenterBolt.scale.set(scaleX, 1, scaleZ);
        topCenterBolt.position.set(x, yCenter + canH / 2 + 0.012, zFilter);
        group.add(topCenterBolt);

        // Base inferior plana cromada com borda frisada
        const botFlatCap = new THREE.Mesh(new THREE.CylinderGeometry(baseR + 0.005, baseR + 0.005, 0.022, 28), mats.chrome);
        botFlatCap.scale.set(scaleX, 1, scaleZ);
        botFlatCap.position.set(x, yCenter - canH / 2 + 0.005, zFilter);
        group.add(botFlatCap);

        // Duas cintas de fixação inox no corpo do filtro
        [-0.22 * scaleY, 0.04 * scaleY].forEach(dy => {
            const strap = new THREE.Mesh(new THREE.CylinderGeometry(baseR + 0.006, baseR + 0.006, 0.032, 28), mats.chrome);
            strap.scale.set(scaleX, 1, scaleZ);
            strap.position.set(x, yCenter + dy, zFilter);
            group.add(strap);
        });

        // 2. Tubo Preto de Borracha (mats.rubber) que sai da FRENTE do filtro de ar e curva 90° para entrar na lateral do capô,
        //    posicionado inteiramente DENTRO do volume da chapa cromada (sem nunca vazar pela frente, topo ou lateral)
        const shroudScaleX = Math.max(0.05, sCfg.dimX / defShroud.dimX);
        const shroudScaleY = Math.max(0.05, sCfg.dimY / defShroud.dimY);
        const shroudScaleZ = Math.max(0.05, sCfg.dimZ / defShroud.dimZ);
        const yawRad = side * THREE.MathUtils.degToRad(sCfg.rotY || 0);

        // Diâmetro aumentado em +4cm (+0.020m no raio: de 0.058m para 0.078m -> diâmetro 15.6cm)
        const rTube = (0.058 + 0.020) * Math.min(scaleX, scaleY, shroudScaleZ);
        // Movido 2cm para cima (+0.020m em relação a 1.676m -> 1.696m)
        const yTubeExit = yCenter + (0.076 + 0.020) * scaleY;
        const xTubeExit = side * (xFilter - 0.082 * scaleX);
        // Parede frontal interna da chapa cromada fica em ~sCfg.posZ + 0.08 * shroudScaleZ;
        // mantemos o centro do tubo recuado pelo menos (rTube + 0.022m) atrás da face frontal da chapa
        const zTubeFrontLimit = sCfg.posZ + 0.075 * shroudScaleZ - rTube - 0.022;
        const zTubeStart = Math.min(zFilter + rZ * 0.55, zTubeFrontLimit - 0.045);
        const zTubeMid = Math.max(zTubeStart + 0.025, zTubeFrontLimit);
        const wHoodAtTube = getHoodSectionParams(zTubeMid).wFlank;
        const xTubeHoodIn = side * (wHoodAtTube - 0.055);
        const dzYawInward = Math.tan(THREE.MathUtils.degToRad(sCfg.rotY || 0)) * Math.abs(xTubeExit - xTubeHoodIn) * 0.45;

        const intakeTubeCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(xTubeExit, yTubeExit, zTubeStart),
            new THREE.Vector3(xTubeExit - side * 0.015, yTubeExit - 0.004, zTubeMid),
            new THREE.Vector3(
                THREE.MathUtils.lerp(xTubeExit, xTubeHoodIn, 0.52),
                yTubeExit - 0.010,
                zTubeMid - dzYawInward * 0.6
            ),
            new THREE.Vector3(xTubeHoodIn, yTubeExit - 0.016, zTubeMid - dzYawInward - 0.010)
        ]);
        const intakeTubeGeo = new THREE.TubeGeometry(intakeTubeCurve, 20, rTube, 18, false);
        group.add(new THREE.Mesh(intakeTubeGeo, mats.rubber));

        // Abraçadeira metálica inox no bocal onde o tubo preto sai da frente do filtro (dentro da chapa cromada)
        const zCollar = THREE.MathUtils.lerp(zTubeStart, zTubeMid, 0.65);
        const clampCollar = new THREE.Mesh(new THREE.CylinderGeometry(rTube + 0.0035, rTube + 0.0035, 0.020, 20), mats.chrome);
        clampCollar.rotation.x = Math.PI / 2;
        clampCollar.position.set(xTubeExit - side * 0.008, yTubeExit - 0.002, zCollar);
        group.add(clampCollar);

        // Suporte metálico inferior sob o bocal do tubo preto (contido dentro da chapa cromada)
        const lowerTubeBracket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.036), mats.chrome);
        lowerTubeBracket.position.set(xTubeExit - side * 0.015, yTubeExit - rTube - 0.010, zCollar);
        group.add(lowerTubeBracket);

        // 3. Chapa Cromada Dobrada (Intake Elbow Shroud) envolvendo por cima e pela frente o tubo preto até o capô,
        //    com corte curvo exato (Linha Verde) acompanhando a parede cilíndrica do filtro de ar para nunca invadir o filtro:
        const yTopShroud = yCenter + canH / 2 - screenH - 0.012; // ~1.86m (alinhado ao anel abaixo da tela superior)
        const zRearShroud = zFilter + rZ + 0.004;                // ~2.519m
        const zCornerShroud = zFilter + rZ + 0.215;              // ~2.730m
        const zBotShroud = zFilter + rZ + 0.125;                 // ~2.640m
        const yBotShroud = yCenter - 0.105 * scaleY;             // ~1.518m

        const pRearTip = new THREE.Vector2(yTopShroud - 0.014, zRearShroud - 0.006);
        const pTopStart = new THREE.Vector2(yTopShroud, zRearShroud + 0.012);
        const pBendStart = new THREE.Vector2(yTopShroud - 0.004, zCornerShroud - 0.055);
        const pBendCtrl = new THREE.Vector2(yTopShroud - 0.006, zCornerShroud + 0.008);
        const pBendEnd = new THREE.Vector2(yTopShroud - 0.068, zCornerShroud - 0.006);
        const pFrontBot = new THREE.Vector2(yBotShroud + 0.020, zBotShroud);
        const pBotLip = new THREE.Vector2(yBotShroud, zBotShroud - 0.022);

        const profileYZ = [];
        profileYZ.push({ y: pRearTip.x, z: pRearTip.y, frontFrac: 0.0, topHorizU: -0.06 });
        profileYZ.push({ y: pTopStart.x, z: pTopStart.y, frontFrac: 0.0, topHorizU: 0.0 });

        const topHorizSteps = 5;
        for (let i = 1; i <= topHorizSteps; i++) {
            const u = i / topHorizSteps;
            profileYZ.push({
                y: THREE.MathUtils.lerp(pTopStart.x, pBendStart.x, u),
                z: THREE.MathUtils.lerp(pTopStart.y, pBendStart.y, u),
                frontFrac: 0.0,
                topHorizU: u
            });
        }

        const bendSteps = 8;
        for (let i = 1; i <= bendSteps; i++) {
            const t = i / bendSteps;
            const omt = 1 - t;
            const y = omt * omt * pBendStart.x + 2 * omt * t * pBendCtrl.x + t * t * pBendEnd.x;
            const z = omt * omt * pBendStart.y + 2 * omt * t * pBendCtrl.y + t * t * pBendEnd.y;
            profileYZ.push({ y, z, frontFrac: t * 0.25, topHorizU: null });
        }

        const frontPlateSteps = 6;
        for (let i = 1; i <= frontPlateSteps; i++) {
            const u = i / frontPlateSteps;
            profileYZ.push({
                y: THREE.MathUtils.lerp(pBendEnd.x, pFrontBot.x, u),
                z: THREE.MathUtils.lerp(pBendEnd.y, pFrontBot.y, u),
                frontFrac: 0.25 + u * 0.65,
                topHorizU: null
            });
        }
        profileYZ.push({ y: pBotLip.x, z: pBotLip.y, frontFrac: 1.0, topHorizU: null });

        // Matriz de transformação da chapa cromada (posição, escala e rotação nos 3 eixos)
        const shroudQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad(sCfg.rotX || 0),
            yawRad,
            side * THREE.MathUtils.degToRad(sCfg.rotZ || 0),
            'XYZ'
        ));
        const shroudMat4 = new THREE.Matrix4().compose(
            new THREE.Vector3(side * sCfg.posX, sCfg.posY, sCfg.posZ),
            shroudQuat,
            new THREE.Vector3(shroudScaleX, shroudScaleY, shroudScaleZ)
        );

        const refX = side * defShroud.posX;
        const refY = defShroud.posY;
        const refZ = defShroud.posZ;
        const toWorld = (lx, ly, lz) => new THREE.Vector3(lx - refX, ly - refY, lz - refZ).applyMatrix4(shroudMat4);

        // Normais e limites laterais de cada estação k do perfil (Y, Z)
        const stationMeta = profileYZ.map((cur, k) => {
            const prev = profileYZ[Math.max(0, k - 1)];
            const next = profileYZ[Math.min(profileYZ.length - 1, k + 1)];
            const dY = next.y - prev.y;
            const dZ = next.z - prev.z;
            const len = Math.hypot(dY, dZ) || 1;
            const nY = dZ / len;
            const nZ = -dY / len;

            const wHoodAtZ = getHoodSectionParams(cur.z).wFlank;
            const axIn = wHoodAtZ - 0.006;
            const axOut = xFilter + (0.012 - 0.038 * cur.frontFrac) * scaleX;
            const dyInwardDrop = -0.035 * Math.pow(cur.frontFrac, 1.5);
            return { cur, nY, nZ, axIn, axOut, dyInwardDrop };
        });

        // Subdivisão lateral (latSegs = 16) + cálculo analítico da interseção (uClip) com o cilindro do filtro de ar
        // para recortar a borda traseira da chapa cromada exatamente ao redor do cilindro (Linha Verde)
        const latSegs = 16;
        const shroudThick = 0.0055;
        const rClearX = rX + 0.003;
        const rClearZ = rZ + 0.003;
        const cxCyl = side * xFilter;
        const czCyl = zFilter;

        const computeStripClipU = (uLat, halfThickSigned) => {
            const stStart = stationMeta[1]; // pTopStart (topHorizU = 0)
            const stBend = stationMeta[1 + topHorizSteps]; // pBendStart (topHorizU = 1)

            const xS = side * THREE.MathUtils.lerp(stStart.axOut, stStart.axIn, uLat);
            const yS = stStart.cur.y + stStart.nY * halfThickSigned + stStart.dyInwardDrop * uLat;
            const zS = stStart.cur.z + stStart.nZ * halfThickSigned;
            const p0 = toWorld(xS, yS, zS);

            const xE = side * THREE.MathUtils.lerp(stBend.axOut, stBend.axIn, uLat);
            const yE = stBend.cur.y + stBend.nY * halfThickSigned + stBend.dyInwardDrop * uLat;
            const zE = stBend.cur.z + stBend.nZ * halfThickSigned;
            const p1 = toWorld(xE, yE, zE);

            const nx0 = (p0.x - cxCyl) / rClearX;
            const nz0 = (p0.z - czCyl) / rClearZ;
            if (nx0 * nx0 + nz0 * nz0 >= 1.0) return 0.0;

            const nx1 = (p1.x - cxCyl) / rClearX;
            const nz1 = (p1.z - czCyl) / rClearZ;
            const dx = nx1 - nx0;
            const dz = nz1 - nz0;
            const A = dx * dx + dz * dz;
            const B = nx0 * dx + nz0 * dz;
            const C = nx0 * nx0 + nz0 * nz0 - 1.0;
            const disc = B * B - A * C;
            if (A <= 1e-8 || disc < 0) return 0.0;

            const uRoot = (-B + Math.sqrt(disc)) / A;
            return THREE.MathUtils.clamp(uRoot, 0.0, 0.88);
        };

        const clipTopStrip = [];
        const clipBotStrip = [];
        for (let m = 0; m <= latSegs; m++) {
            const uLat = m / latSegs;
            // Usa o mesmo uClip (da face superior) para a face superior e inferior na mesma fatia lateral,
            // garantindo um corte perpendicular limpo ao redor do cilindro
            const uClip = Math.max(
                computeStripClipU(uLat, shroudThick * 0.5),
                computeStripClipU(uLat, -shroudThick * 0.5)
            );
            clipTopStrip.push(uClip);
            clipBotStrip.push(uClip);
        }

        const evalPointOnStrip = (k, uLat, halfThickSigned, uClip) => {
            const st = stationMeta[k];
            if (st.cur.topHorizU !== null) {
                const stStart = stationMeta[1];
                const stBend = stationMeta[1 + topHorizSteps];
                const rawU = st.cur.topHorizU;
                const uMapped = rawU < 0
                    ? uClip
                    : THREE.MathUtils.lerp(uClip, 1.0, rawU);
                const dropStart = rawU < 0 ? -0.008 : 0.0;

                const xL = side * THREE.MathUtils.lerp(
                    THREE.MathUtils.lerp(stStart.axOut, stStart.axIn, uLat),
                    THREE.MathUtils.lerp(stBend.axOut, stBend.axIn, uLat),
                    uMapped
                );
                const yBase = THREE.MathUtils.lerp(stStart.cur.y, stBend.cur.y, uMapped) + dropStart;
                const zBase = THREE.MathUtils.lerp(stStart.cur.z, stBend.cur.z, uMapped);
                const nY = THREE.MathUtils.lerp(stStart.nY, stBend.nY, uMapped);
                const nZ = THREE.MathUtils.lerp(stStart.nZ, stBend.nZ, uMapped);
                const dyDrop = THREE.MathUtils.lerp(stStart.dyInwardDrop, stBend.dyInwardDrop, uMapped) * uLat;

                const wp = toWorld(
                    xL,
                    yBase + nY * halfThickSigned + dyDrop,
                    zBase + nZ * halfThickSigned
                );
                return [wp.x, wp.y, wp.z];
            }

            const xL = side * THREE.MathUtils.lerp(st.axOut, st.axIn, uLat);
            const yL = st.cur.y + st.nY * halfThickSigned + st.dyInwardDrop * uLat;
            const zL = st.cur.z + st.nZ * halfThickSigned;
            const wp = toWorld(xL, yL, zL);

            // Segurança extra: impede que qualquer vértice da dobra invada o cilindro do filtro
            const dxC = (wp.x - cxCyl) / rClearX;
            const dzC = (wp.z - czCyl) / rClearZ;
            const rSq = dxC * dxC + dzC * dzC;
            if (rSq < 1.0 && rSq > 1e-6) {
                const invR = 1.0 / Math.sqrt(rSq);
                wp.x = cxCyl + (wp.x - cxCyl) * invR;
                wp.z = czCyl + (wp.z - czCyl) * invR;
            }
            return [wp.x, wp.y, wp.z];
        };

        const shroudSections = [];
        for (let k = 0; k < profileYZ.length; k++) {
            const topPts = [];
            const botPts = [];
            for (let m = 0; m <= latSegs; m++) {
                const uLat = m / latSegs;
                topPts.push(evalPointOnStrip(k, uLat, shroudThick * 0.5, clipTopStrip[m]));
                botPts.push(evalPointOnStrip(k, uLat, -shroudThick * 0.5, clipBotStrip[m]));
            }
            botPts.reverse();
            const ring = [...topPts, ...botPts];
            if (side < 0) ring.reverse();
            shroudSections.push(ring);
        }

        const shroudMesh = new THREE.Mesh(createLoftedGeometry(shroudSections, true, true, true, 0.45), mats.chrome);
        group.add(shroudMesh);
    });

    return group;
}

// ============================================================================
// 10. ESCAPAMENTOS VERTICAIS DUPLOS DE 8" (MONSTER STACKS) COM HEAT SHIELD
// ============================================================================

function buildMonsterExhaustStacks(mats) {
    const group = new THREE.Group();

    // Reposicionados no bolso entre a traseira da cabine (Z=1.03m, |X|=0.73m) e a quina curva do sleeper (|X|=1.045m):
    // O arco frontal da proteção envolve o cano (+20% de diâmetro: stackD=0.144m, stackR=0.072m) com raio shieldR=0.1008m
    // e sua aba lateral plana sai tangencialmente em |X| = xStack + shieldR = 1.054m, faceando a parede lateral do sleeper (|X|=1.045m).
    const zStack = 0.998;
    const stackD = 0.12 * 1.20;        // 0.144m (+20% no diâmetro dos canos do escapamento)
    const stackR = stackD / 2;         // Raio externo = 0.072m
    const innerR = stackR * 0.86;      // Raio interno da parede da ponteira
    const shieldR = 0.084 * 1.20;      // 0.1008m (+20% no raio da proteção acompanhando o cano)
    const xStack = (SLEEPER_HALF_W + 0.009) - shieldR; // ~1.0982m (mantém a aba lateral externa exatamente em |X| = SLEEPER_HALF_W + 0.009m junto ao sleeper de 2.38m)
    const shieldThick = 0.004;         // Espessura de 4mm da chapa cromada dobrada
    const zRearShield = 0.725;         // Borda traseira vertical da aba lateral sobre a lateral do sleeper
    const yShieldBot = CHASSIS_Y_TOP + 0.11; // 1.00m (apoiada exatamente sobre o topo da saia cromada inferior de 11cm)
    const yShieldTop = 2.62;           // 2.62m (acima do topo da moldura da porta em 2.508m)

    const radialSegs = 24;
    const curveSteps = 14;
    const elbowR = 0.18;               // Raio do joelho inferior (curvando para dentro do caminhão em direção ao chassi)
    const alturaBase = 0.70;           // Altura Y da face inferior do cano ao solo (0.70m -> yPipeBot = 0.952m)
    const yPipeBot = alturaBase + elbowR + stackR; // Tubo desce reto abaixo da proteção antes da curva inferior
    const yBendStart = 3.28 + 0.50;    // 3.78m (+50 cm na altura dos escapamentos)
    const bendRadius = 0.32;           // Raio de curvatura do eixo da ponteira proporcional ao novo diâmetro
    const bendAngle = 0.96;            // Ângulo da curva (~55°)
    const slashDelta = 0.18;           // Corte chanfrado (miter/slash cut) na boca da ponteira
    const outAngle = 0.30;             // ~17° ligeiramente para fora do caminhão (e para trás)

    [-1, 1].forEach(side => {
        const x0 = side * xStack;

        // Direção horizontal para onde a ponteira curva: para trás (-Z) e ligeiramente para fora (+side * X)
        const dirX = side * Math.sin(outAngle);
        const dirZ = -Math.cos(outAngle);

        // Vetores ortonormais horizontais na base (theta = 0):
        // N0 aponta para o lado externo da curva (+frente/-fora), B é perpendicular ao plano da curva
        const n0x = -dirX, n0z = -dirZ;
        const bx = -dirZ, bz = dirX;

        const makeStraightRing = (y, r) => {
            const ring = [];
            for (let j = 0; j < radialSegs; j++) {
                const phi = (j / radialSegs) * Math.PI * 2;
                const cosP = Math.cos(phi);
                const sinP = Math.sin(phi);
                ring.push([
                    x0 + r * (cosP * n0x + sinP * bx),
                    y,
                    z0_val(r, cosP, sinP)
                ]);
            }
            return ring;
        };

        const z0_val = (r, cosP, sinP) => zStack + r * (cosP * n0z + sinP * bz);

        const elbowSteps = 10;
        const makeLowerElbowRing = (alpha, r, extraInwardX = 0) => {
            const ring = [];
            const cosA = Math.cos(alpha);
            const sinA = Math.sin(alpha);
            const cx = x0 - side * (elbowR * (1 - cosA) + extraInwardX);
            const cy = yPipeBot - elbowR * sinA;
            for (let j = 0; j < radialSegs; j++) {
                const phi = (j / radialSegs) * Math.PI * 2;
                const cosP = Math.cos(phi);
                const sinP = Math.sin(phi);
                const dx0 = r * (cosP * n0x + sinP * bx);
                const dz0 = r * (cosP * n0z + sinP * bz);
                ring.push([
                    cx + dx0 * cosA,
                    cy - side * dx0 * sinA,
                    zStack + dz0
                ]);
            }
            return ring;
        };

        const makeCurvedRing = (s, r) => {
            const ring = [];
            for (let j = 0; j < radialSegs; j++) {
                const phi = (j / radialSegs) * Math.PI * 2;
                const cosP = Math.cos(phi);
                const sinP = Math.sin(phi);

                // Em s = 0, theta = 0 (alinhado 100% ao topo do cano vertical).
                // Em s = 1, aplica o chanfro (slash cut) na borda da ponteira.
                const theta = s * (bendAngle + s * slashDelta * cosP);
                const sinT = Math.sin(theta);
                const cosT = Math.cos(theta);

                const dH = bendRadius * (1 - cosT);
                const dY = bendRadius * sinT;

                const cx = x0 + dirX * dH;
                const cy = yBendStart + dY;
                const cz = zStack + dirZ * dH;

                const nx = -dirX * cosT;
                const ny = sinT;
                const nz = -dirZ * cosT;

                ring.push([
                    cx + r * (cosP * nx + sinP * bx),
                    cy + r * (cosP * ny),
                    cz + r * (cosP * nz + sinP * bz)
                ]);
            }
            return ring;
        };

        // 1. Malha contínua: Joelho inferior entrando no chassi + Tubo vertical externo + Ponteira curva externa + Borda (lip) + Parede interna!
        const pipeAndTipSections = [];

        // Trecho horizontal entrando no chassi + Joelho inferior de 90° (alpha = PI/2 até 0 em yPipeBot = 0.72m)
        pipeAndTipSections.push(makeLowerElbowRing(Math.PI / 2, stackR, 0.28 + (SLEEPER_HALF_W - 1.045)));
        for (let i = elbowSteps; i >= 0; i--) {
            pipeAndTipSections.push(makeLowerElbowRing((i / elbowSteps) * (Math.PI / 2), stackR, 0));
        }

        // Trecho reto vertical externo (de Y = 0.72 até Y = 3.78)
        pipeAndTipSections.push(makeStraightRing((yPipeBot + yBendStart) * 0.5, stackR));

        // Curva externa da ponteira (de s = 0 até s = 1)
        for (let i = 0; i <= curveSteps; i++) {
            pipeAndTipSections.push(makeCurvedRing(i / curveSteps, stackR));
        }

        // Borda chanfrada (lábio metálico no topo da ponteira)
        pipeAndTipSections.push(makeCurvedRing(1.006, (stackR + innerR) * 0.5));

        // Parede interna cromada da ponteira (voltando de s = 1.0 até s = 0.05 com normais voltadas para o interior!)
        for (let i = curveSteps; i >= 1; i--) {
            pipeAndTipSections.push(makeCurvedRing(i / curveSteps, innerR));
        }

        const stackGeo = createLoftedGeometry(pipeAndTipSections, true, true, false, 0.78);
        group.add(new THREE.Mesh(stackGeo, mats.chrome));

        // Fundo escuro (fuligem) no interior profundo da curva para bloquear luz vinda de baixo
        const sootSections = [
            makeCurvedRing(0.10, innerR * 0.99),
            makeCurvedRing(0.28, innerR * 0.99)
        ];
        const sootGeo = createLoftedGeometry(sootSections, true, true, true, 0.78);
        group.add(new THREE.Mesh(sootGeo, mats.rubber));

        // 2. Proteção Térmica em Chapa Cromada Dobrada com Formato de "Metade de uma Gota" (Half-Teardrop):
        //    - Seção circular frontal (de theta = -110° na borda interna até theta = +90° na tangente externa) envolvendo o cano
        //    - Aba lateral traseira estendendo-se tangencialmente para trás (de Z = zStack até Z = zRearShield) rente à lateral do sleeper
        const arcSegs = 28;
        const wingSegs = 14;
        const thetaStart = -110 * (Math.PI / 180);
        const thetaEnd = Math.PI / 2;
        const innerShieldR = shieldR - shieldThick;

        const profilePts = []; // { xOut, zOut, xIn, zIn, nx, nz, s }
        let accumS = 0;

        for (let i = 0; i <= arcSegs; i++) {
            const theta = THREE.MathUtils.lerp(thetaStart, thetaEnd, i / arcSegs);
            const nx = side * Math.sin(theta);
            const nz = Math.cos(theta);
            const absXOut = xStack + shieldR * Math.sin(theta);
            const zOut = zStack + shieldR * Math.cos(theta);
            const absXIn = xStack + innerShieldR * Math.sin(theta);
            const zIn = zStack + innerShieldR * Math.cos(theta);
            const xOut = side * absXOut;
            const xIn = side * absXIn;

            if (profilePts.length > 0) {
                const prev = profilePts[profilePts.length - 1];
                accumS += Math.hypot(xOut - prev.xOut, zOut - prev.zOut);
            }
            profilePts.push({ xOut, zOut, xIn, zIn, nx, nz, s: accumS });
        }

        const absXWingBase = xStack + shieldR; // 1.054m
        for (let j = 1; j <= wingSegs; j++) {
            const t = j / wingSegs;
            const zOut = THREE.MathUtils.lerp(zStack, zRearShield, t);
            const zIn = zOut;
            // Leve fechamento de 4mm na borda traseira para encostar na lateral do sleeper (|X|=1.045m)
            const taper = 0.004 * (t * t);
            const absXOut = absXWingBase - taper;
            const absXIn = absXOut - shieldThick;
            const xOut = side * absXOut;
            const xIn = side * absXIn;
            const prev = profilePts[profilePts.length - 1];
            accumS += Math.hypot(xOut - prev.xOut, zOut - prev.zOut);
            profilePts.push({ xOut, zOut, xIn, zIn, nx: side, nz: 0, s: accumS });
        }

        const totalS = accumS || 1;

        // 2.1 Face externa contínua da chapa dobrada com normais analíticas e mapeamento UV exato (mats.heatShield)
        const outPositions = [];
        const outNormals = [];
        const outUvs = [];

        const pushOutVertex = (pt, y, v) => {
            outPositions.push(pt.xOut, y, pt.zOut);
            outNormals.push(pt.nx, 0, pt.nz);
            outUvs.push(pt.s / totalS, v);
        };

        for (let k = 0; k < profilePts.length - 1; k++) {
            const p0 = profilePts[k];
            const p1 = profilePts[k + 1];
            if (side > 0) {
                pushOutVertex(p0, yShieldBot, 0);
                pushOutVertex(p1, yShieldBot, 0);
                pushOutVertex(p1, yShieldTop, 1);

                pushOutVertex(p0, yShieldBot, 0);
                pushOutVertex(p1, yShieldTop, 1);
                pushOutVertex(p0, yShieldTop, 1);
            } else {
                pushOutVertex(p0, yShieldBot, 0);
                pushOutVertex(p1, yShieldTop, 1);
                pushOutVertex(p1, yShieldBot, 0);

                pushOutVertex(p0, yShieldBot, 0);
                pushOutVertex(p0, yShieldTop, 1);
                pushOutVertex(p1, yShieldTop, 1);
            }
        }

        const outerShieldGeo = new THREE.BufferGeometry();
        outerShieldGeo.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
        outerShieldGeo.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
        outerShieldGeo.setAttribute('uv', new THREE.Float32BufferAttribute(outUvs, 2));
        group.add(new THREE.Mesh(outerShieldGeo, mats.heatShield));

        // 2.2 Face interna + bordas superior, inferior, interna e traseira da chapa dobrada de 4mm (mats.chrome)
        //     visíveis especialmente de cima (mostrando o perfil oco de "metade de gota" ao redor do cano)
        const innerBotSec = profilePts.map(p => [p.xIn, yShieldBot, p.zIn]);
        const innerTopSec = profilePts.map(p => [p.xIn, yShieldTop, p.zIn]);
        const outerTopSec = profilePts.map(p => [p.xOut, yShieldTop, p.zOut]);
        const outerBotSec = profilePts.map(p => [p.xOut, yShieldBot, p.zOut]);

        const innerWallSections = side > 0
            ? [outerTopSec, innerTopSec, innerBotSec, outerBotSec]
            : [outerBotSec, innerBotSec, innerTopSec, outerTopSec];
        group.add(new THREE.Mesh(createLoftedGeometry(innerWallSections, false, false, false, 0.35), mats.chrome));

        // Fechamento das duas bordas verticais (borda interna k=0 e borda traseira k=N)
        [0, profilePts.length - 1].forEach(idx => {
            const p = profilePts[idx];
            const sBot = [[p.xIn, yShieldBot, p.zIn], [p.xOut, yShieldBot, p.zOut]];
            const sTop = [[p.xIn, yShieldTop, p.zIn], [p.xOut, yShieldTop, p.zOut]];
            const edgeSecs = (side > 0) === (idx === 0) ? [sBot, sTop] : [sTop, sBot];
            group.add(new THREE.Mesh(createLoftedGeometry(edgeSecs, false, false, false, 0.2), mats.chrome));
        });

        // 2.3 Suportes internos (standoff brackets) conectando o cano à face interna da proteção térmica
        [1.32, 2.31].forEach(yBrk => {
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(stackR + 0.004, stackR + 0.004, 0.024, 20), mats.chrome);
            collar.position.set(x0, yBrk, zStack);
            group.add(collar);

            const standoff = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.020, shieldR - stackR), mats.chrome);
            standoff.position.set(x0, yBrk, zStack + (stackR + innerShieldR) * 0.5);
            group.add(standoff);
        });

        // 2.4 Parafusos/rebites cromados de fixação:
        //     - 4 parafusos alinhados verticalmente junto à borda traseira da aba lateral (visíveis na vista lateral e frontal)
        //     - 3 parafusos frontais nos suportes do arco (acima da faixa superior de furos, entre as duas faixas e abaixo da inferior)
        const boltGeo = new THREE.SphereGeometry(0.0065, 10, 8);
        const zRearBolt = zRearShield + 0.032;
        const xRearBolt = side * (absXWingBase - 0.002);
        [1.18, 1.58, 1.98, 2.38].forEach(yB => {
            const rearBolt = new THREE.Mesh(boltGeo, mats.chrome);
            rearBolt.scale.set(0.45, 1, 1);
            rearBolt.position.set(xRearBolt, yB, zRearBolt);
            group.add(rearBolt);
        });

        const zFrontBolt = zStack + shieldR;
        [1.32, 1.815, 2.31].forEach(yB => {
            const frontBolt = new THREE.Mesh(boltGeo, mats.chrome);
            frontBolt.scale.set(1, 1, 0.45);
            frontBolt.position.set(x0, yB, zFrontBolt);
            group.add(frontBolt);
        });
    });

    return group;
}

// ============================================================================
// 11. 86" STUDIO AERODYNE SLEEPER ESCULPIDO (FRENTE CURVA EM ARCO, LARGURA = 2.38m, COMPRIMENTO = 2.04m, ALTURA = 2.46m ACIMA DO CHASSI)
// ============================================================================

const SLEEPER_Z_FRONT_APEX = 1.21;                    // Ápice frontal central do sleeper (X = 0 -> trecho visível central do núcleo = 2.33 - 1.21 = 1.12m)
const SLEEPER_LEN = 1.86;                             // Comprimento do sleeper reduzido em 0.18m (de 2.04m para 1.86m) para alinhar a emenda à linha verde
const SLEEPER_Z_REAR = SLEEPER_Z_FRONT_APEX - SLEEPER_LEN; // -0.65m (emenda entre o sleeper e o defletor traseiro alinhada à linha verde)
const SLEEPER_DEFLECTOR_LEN = 0.48;                   // Comprimento do defletor aumentado em +0.18m (de 0.30m para 0.48m), mantendo o comprimento total inalterado
const SLEEPER_DEFLECTOR_Z_REAR = SLEEPER_Z_REAR - SLEEPER_DEFLECTOR_LEN; // -1.13m (extremidade traseira vermelha do defletor)
const SLEEPER_HALF_W = 1.190;                         // Meia-largura do sleeper (2.38m total)
const SLEEPER_FRONT_CURVE_DROP = 0.38;                // Recuo do arco frontal nas extremidades laterais (X = ±1.190m -> Z = 0.83m)
const SLEEPER_ARC_RADIUS = (SLEEPER_HALF_W * SLEEPER_HALF_W + SLEEPER_FRONT_CURVE_DROP * SLEEPER_FRONT_CURVE_DROP) / (2 * SLEEPER_FRONT_CURVE_DROP);

const SLEEPER_CORNER_RADIUS = 0.10;                   // Raio de 10 cm (0.10m) para arredondar as quinas laterais (frente-lateral e topo-lateral) do sleeper
const SLEEPER_ARC_CENTER_Z = SLEEPER_Z_FRONT_APEX - SLEEPER_ARC_RADIUS;
const SLEEPER_FILLET_XC = SLEEPER_HALF_W - SLEEPER_CORNER_RADIUS; // 1.190 - 0.10 = 1.090m
const SLEEPER_FILLET_ZC = SLEEPER_ARC_CENTER_Z + Math.sqrt(
    Math.max(0, (SLEEPER_ARC_RADIUS - SLEEPER_CORNER_RADIUS) ** 2 - SLEEPER_FILLET_XC ** 2)
); // ~0.7879m
const SLEEPER_FILLET_XTAN = SLEEPER_FILLET_XC * (SLEEPER_ARC_RADIUS / (SLEEPER_ARC_RADIUS - SLEEPER_CORNER_RADIUS)); // ~1.1483m

function getSleeperFrontZ(x) {
    const absX = Math.min(SLEEPER_HALF_W, Math.abs(x));
    if (absX <= SLEEPER_FILLET_XTAN) {
        return SLEEPER_ARC_CENTER_Z + Math.sqrt(Math.max(0, SLEEPER_ARC_RADIUS * SLEEPER_ARC_RADIUS - absX * absX));
    }
    const dx = absX - SLEEPER_FILLET_XC;
    return SLEEPER_FILLET_ZC + Math.sqrt(Math.max(0, SLEEPER_CORNER_RADIUS * SLEEPER_CORNER_RADIUS - dx * dx));
}

function buildSculptedAerodyneSleeper(mats, sideVistaParams = DEFAULT_CABIN_ELEMENTS_PARAMS.janelaSuperiorSleeper) {
    const group = new THREE.Group();

    const zFront = SLEEPER_Z_FRONT_APEX; // 1.21m no centro (X=0)
    const sleeperLen = SLEEPER_LEN;      // 2.04m
    const zRear = SLEEPER_Z_REAR;        // -0.83m
    const yBot = CHASSIS_Y_TOP;          // 0.89m (apoiado na parte superior do chassi)
    const ySleeperTop = SLEEPER_Y_TOP;   // 3.35m (0.89m + 2.46m de altura acima do topo do chassi)
    const wSleeper = SLEEPER_HALF_W;     // 1.190m (largura total = 2.38m)
    const zSideFrontRef = 0.83;          // Referência original para manter a posição das janelas laterais e bagageiro inalterada
    const zSideFlatFront = getSleeperFrontZ(wSleeper); // ~0.7879m (onde termina o arco de 10cm de raio e começa a parede lateral plana)

    const svPosX = (sideVistaParams && sideVistaParams.posX !== undefined) ? sideVistaParams.posX : SLEEPER_HALF_W;
    const svPosY = (sideVistaParams && sideVistaParams.posY !== undefined) ? sideVistaParams.posY : 2.965;
    const svPosZ = (sideVistaParams && sideVistaParams.posZ !== undefined) ? sideVistaParams.posZ : 0.1175;
    const svDimX = (sideVistaParams && sideVistaParams.dimX !== undefined) ? Math.max(0.002, sideVistaParams.dimX) : 0.009;
    const svDimY = (sideVistaParams && sideVistaParams.dimY !== undefined) ? Math.max(0.04, sideVistaParams.dimY) : 0.255;
    const svDimZ = (sideVistaParams && sideVistaParams.dimZ !== undefined) ? Math.max(0.10, sideVistaParams.dimZ) : 0.975;

    // 11.1 Corpo + Teto Elevado do Studio Sleeper com quinas laterais (frente-lateral e topo-lateral) arredondadas com raio de 10 cm (0.10m):
    const SLEEPER_RAMP_RUN = 0.56;
    const rShoulder = SLEEPER_CORNER_RADIUS;      // 0.10m (10 cm)
    const xShoulderStart = wSleeper - rShoulder;  // 0.945m
    const sideSteps = 10;
    const centerSteps = 22;
    const xStations = [];

    // Amostragem angular uniforme (alpha de PI/2 a 0 na esquerda e de 0 a PI/2 na direita) nos 10 cm externos
    // para que tanto o arco horizontal (XZ) quanto o arco vertical do teto (XY) cheguem tangentes (90°) à parede lateral |x|=1.045m
    for (let i = 0; i <= sideSteps; i++) {
        const alpha = (1 - i / sideSteps) * (Math.PI / 2);
        xStations.push(-(xShoulderStart + rShoulder * Math.sin(alpha)));
    }
    for (let i = 1; i < centerSteps; i++) {
        xStations.push(THREE.MathUtils.lerp(-xShoulderStart, xShoulderStart, i / centerSteps));
    }
    for (let i = 0; i <= sideSteps; i++) {
        const alpha = (i / sideSteps) * (Math.PI / 2);
        xStations.push(xShoulderStart + rShoulder * Math.sin(alpha));
    }

    // Perfis transversais C1-contínuos em X com arredondamento circular de 10 cm (0.10m) nos ombros laterais (|x| de 0.945m até 1.045m):
    const crownDropCenter = 0.018;
    const yShoulderArcTop = ySleeperTop - crownDropCenter; // 3.332m em |x| = 0.945m
    const yShoulderArcCenter = yShoulderArcTop - rShoulder; // 3.232m (acima do topo da janela lateral superior em 3.220m)

    const getSleeperYBase = (x) => {
        const absX = Math.min(wSleeper, Math.abs(x));
        if (absX <= xShoulderStart) {
            const t = absX / xShoulderStart;
            return 2.892 - 0.014 * (t * t);
        }
        const dx = absX - xShoulderStart;
        const arcDrop = rShoulder - Math.sqrt(Math.max(0, rShoulder * rShoulder - dx * dx));
        return (2.892 - 0.014) - 0.45 * arcDrop;
    };

    const getSleeperYHigh = (x) => {
        const absX = Math.min(wSleeper, Math.abs(x));
        if (absX <= xShoulderStart) {
            const t = absX / xShoulderStart;
            return ySleeperTop - crownDropCenter * (t * t);
        }
        const dx = absX - xShoulderStart;
        return yShoulderArcCenter + Math.sqrt(Math.max(0, rShoulder * rShoulder - dx * dx));
    };

    const sleeperSections = [];
    const rearFilletSteps = 4;
    const topFilletSteps = 7;
    const botFilletSteps = 8;

    for (const x of xStations) {
        const absX = Math.abs(x);
        const zF = getSleeperFrontZ(x);
        const zRampTop = Math.max(zRear + 0.12, zF - SLEEPER_RAMP_RUN);
        const yHigh = getSleeperYHigh(x);
        const yBase = getSleeperYBase(x);

        // Nos ombros externos (fora das Vista Windows frontais), amplia o raio do fillet frontal para suavizar ainda mais a junção frente-topo
        const outerBlend = THREE.MathUtils.smoothstep(absX, 0.72 * (wSleeper / 1.045), wSleeper);
        const dBot = THREE.MathUtils.lerp(0.080, 0.125, outerBlend);
        const tBot = THREE.MathUtils.lerp(0.18, 0.30, outerBlend);
        const tTop = THREE.MathUtils.lerp(0.78, 0.72, outerBlend);
        const dTopRoofZ = THREE.MathUtils.lerp(0.10, 0.12, outerBlend);
        const rRear = 0.050;

        // Ordem anti-horária no plano YZ (vista de +X) para que todas as normais apontem para FORA do sleeper:
        // Base-Frente -> Base-Trás -> Fillet Topo-Trás -> Fillet Topo-Rampa -> Rampa -> Fillet Frente-Rampa -> Base-Frente
        const ring = [
            [x, yBot, zF],
            [x, yBot, zRear]
        ];

        // 1. Fillet traseiro superior em (yHigh, zRear)
        for (let k = 0; k <= rearFilletSteps; k++) {
            const tau = k / rearFilletSteps;
            const inv = 1 - tau;
            const yPt = inv * inv * (yHigh - rRear) + 2 * inv * tau * yHigh + tau * tau * yHigh;
            const zPt = inv * inv * zRear + 2 * inv * tau * zRear + tau * tau * (zRear + rRear);
            ring.push([x, yPt, zPt]);
        }

        // 2. Fillet superior entre o teto horizontal e a rampa frontal inclinada em torno de (yHigh, zRampTop)
        const yRampTopStart = THREE.MathUtils.lerp(yBase, yHigh, tTop);
        const zRampTopStart = THREE.MathUtils.lerp(zF, zRampTop, tTop);
        const zRoofFrontStart = Math.max(zRear + rRear + 0.02, zRampTop - dTopRoofZ);
        for (let k = 0; k <= topFilletSteps; k++) {
            const tau = k / topFilletSteps;
            const inv = 1 - tau;
            const yPt = inv * inv * yHigh + 2 * inv * tau * yHigh + tau * tau * yRampTopStart;
            const zPt = inv * inv * zRoofFrontStart + 2 * inv * tau * zRampTop + tau * tau * zRampTopStart;
            ring.push([x, yPt, zPt]);
        }

        // 3. Fillet inferior entre a rampa frontal inclinada e a parede frontal vertical em torno de (yBase, zF)
        const yRampBotEnd = THREE.MathUtils.lerp(yBase, yHigh, tBot);
        const zRampBotEnd = THREE.MathUtils.lerp(zF, zRampTop, tBot);
        const yVertTop = yBase - dBot;
        for (let k = 0; k <= botFilletSteps; k++) {
            const tau = k / botFilletSteps;
            const inv = 1 - tau;
            const yPt = inv * inv * yRampBotEnd + 2 * inv * tau * yBase + tau * tau * yVertTop;
            const zPt = inv * inv * zRampBotEnd + 2 * inv * tau * zF + tau * tau * zF;
            ring.push([x, yPt, zPt]);
        }

        sleeperSections.push(ring);
    }
    group.add(new THREE.Mesh(createLoftedGeometry(sleeperSections, true, true, true, 0.55), mats.paint));

    // 11.2 Duas Janelas Panorâmicas Inclinadas "Vista Windows" acompanhando a Rampa Frontal Curva de 0.56m do Sleeper
    // (mesma faixa de altura vertical Y = yVistaBot..yVistaTop das novas janelas superiores laterais)
    const yVistaBot = 2.98;                    // 2.98m (alinhada com as janelas superiores laterais do sleeper)
    const yVistaTop = ySleeperTop - 0.115;     // 3.235m

    // Calcula a coordenada Z exata da superfície da rampa frontal do sleeper em qualquer ponto (x, y)
    const getSleeperRampZ = (x, y) => {
        const yHigh = getSleeperYHigh(x);
        const yBase = getSleeperYBase(x);
        const zF = getSleeperFrontZ(x);
        const zRampTop = Math.max(zRear + 0.12, zF - SLEEPER_RAMP_RUN);
        const t = (y - yBase) / (yHigh - yBase);
        return THREE.MathUtils.lerp(zF, zRampTop, t);
    };

    [-1, 1].forEach(side => {
        // Mantém a mesma largura de 0.60m de cada Vista Window frontal, apenas deslocando +0.06m para acompanhar a rampa mais larga
        const xMin = side < 0 ? -0.80 : 0.20;
        const xMax = side < 0 ? -0.20 : 0.80;
        const winSteps = 8;
        const rubberBot = [], rubberTop = [];
        const glassBot = [], glassTop = [];

        for (let i = 0; i <= winSteps; i++) {
            const s = i / winSteps;
            const xBotG = THREE.MathUtils.lerp(xMin - 0.02, xMax + 0.02, s);
            const xTopG = xBotG * 0.96;
            const xBotV = THREE.MathUtils.lerp(xMin, xMax, s);
            const xTopV = xBotV * 0.96;

            const yBotV = yVistaBot + 0.012;
            const yTopV = yVistaTop - 0.012;

            rubberBot.push([xBotG, yVistaBot, getSleeperRampZ(xBotG, yVistaBot) + 0.010]);
            rubberTop.push([xTopG, yVistaTop, getSleeperRampZ(xTopG, yVistaTop) + 0.010]);

            glassBot.push([xBotV, yBotV, getSleeperRampZ(xBotV, yBotV) + 0.015]);
            glassTop.push([xTopV, yTopV, getSleeperRampZ(xTopV, yTopV) + 0.015]);
        }

        group.add(new THREE.Mesh(createLoftedGeometry([rubberBot, rubberTop], false, false, false, 0.8), mats.rubber));
        group.add(new THREE.Mesh(createLoftedGeometry([glassBot, glassTop], false, false, false, 0.8), mats.glass));
    });

    // Helper para criar perfil trapezoidal com cantos arredondados no plano lateral YZ (para as janelas superiores laterais do sleeper)
    const buildRoundedSideVistaMesh = (side, yB, yT, zRearW, zFBot, zFTop, xOutOff, mat) => {
        const corners = [
            [yT, zRearW],
            [yB, zRearW],
            [yB, zFBot],
            [yT, zFTop]
        ];
        const radii = [0.036, 0.036, 0.042, 0.048];
        const cornerSteps = 5;
        const loopYZ = [];

        for (let i = 0; i < 4; i++) {
            const pPrev = corners[(i + 3) % 4];
            const pCurr = corners[i];
            const pNext = corners[(i + 1) % 4];
            const r = radii[i];

            const vInY = pPrev[0] - pCurr[0], vInZ = pPrev[1] - pCurr[1];
            const lenIn = Math.hypot(vInY, vInZ) || 1;
            const vOutY = pNext[0] - pCurr[0], vOutZ = pNext[1] - pCurr[1];
            const lenOut = Math.hypot(vOutY, vOutZ) || 1;

            const dIn = Math.min(r, lenIn * 0.4);
            const dOut = Math.min(r, lenOut * 0.4);

            const startY = pCurr[0] + (vInY / lenIn) * dIn;
            const startZ = pCurr[1] + (vInZ / lenIn) * dIn;
            const endY = pCurr[0] + (vOutY / lenOut) * dOut;
            const endZ = pCurr[1] + (vOutZ / lenOut) * dOut;

            for (let k = 0; k <= cornerSteps; k++) {
                const t = k / cornerSteps;
                const omt = 1 - t;
                const y = omt * omt * startY + 2 * omt * t * pCurr[0] + t * t * endY;
                const z = omt * omt * startZ + 2 * omt * t * pCurr[1] + t * t * endZ;
                loopYZ.push([y, z]);
            }
        }

        if (side > 0) loopYZ.reverse();

        const xIn = side * (svPosX - 0.002);
        const xOut = side * (svPosX + xOutOff);
        const secIn = loopYZ.map(([y, z]) => [xIn, y, z]);
        const secOut = loopYZ.map(([y, z]) => [xOut, y, z]);
        return new THREE.Mesh(createLoftedGeometry([secIn, secOut], true, true, true, 0.4), mat);
    };

    // 11.3 Detalhes Laterais do Sleeper: Faixas Clássicas (contornando a quina frontal arredondada de 10cm até o núcleo), Janelas, Bagageiro e Saias Inox
    const sideWallLen = zSideFlatFront - zRear;
    const zCenterSide = (zSideFlatFront + zRear) / 2;

    [-1, 1].forEach(side => {
        const xWall = side * (wSleeper + 0.003);
        const xGold = side * (wSleeper + 0.0045);

        // Pontos de contorno horizontal + normais externas (nx, nz) no plano XZ acompanhando o arco de 10cm de raio na esquina frontal
        const contourXZ = [
            { absX: wSleeper, z: zRear + 0.02, nx: 1, nz: 0 },
            { absX: wSleeper, z: zSideFlatFront, nx: 1, nz: 0 }
        ];
        const cornerArcSteps = 8;
        const alphaTan = Math.asin(THREE.MathUtils.clamp((SLEEPER_FILLET_XTAN - SLEEPER_FILLET_XC) / SLEEPER_CORNER_RADIUS, 0, 1));
        for (let i = 1; i <= cornerArcSteps; i++) {
            const alpha = THREE.MathUtils.lerp(Math.PI / 2, alphaTan, i / cornerArcSteps);
            const sinA = Math.sin(alpha);
            const cosA = Math.cos(alpha);
            contourXZ.push({
                absX: SLEEPER_FILLET_XC + SLEEPER_CORNER_RADIUS * sinA,
                z: SLEEPER_FILLET_ZC + SLEEPER_CORNER_RADIUS * cosA,
                nx: sinA,
                nz: cosA
            });
        }
        const arcSteps = 8;
        for (let i = 1; i <= arcSteps; i++) {
            const xArc = THREE.MathUtils.lerp(SLEEPER_FILLET_XTAN, CONE_W_END, i / arcSteps);
            const zArc = getSleeperFrontZ(xArc);
            const dz = zArc - SLEEPER_ARC_CENTER_Z;
            const nLen = Math.hypot(xArc, dz) || 1;
            contourXZ.push({ absX: xArc, z: zArc, nx: xArc / nLen, nz: dz / nLen });
        }

        const buildContourStrip = (yTop, yBot, offsetOut, mat) => {
            const sections = [];
            for (const pt of contourXZ) {
                const x = side * (pt.absX + offsetOut * pt.nx);
                const z = pt.z + offsetOut * pt.nz;
                const pts = [[x, yTop, z], [x, yBot, z]];
                if (side > 0) pts.reverse();
                sections.push(pts);
            }
            return new THREE.Mesh(createLoftedGeometry(sections, false, false, false, 0.55), mat);
        };

        // Faixa principal Branco-Pérola + Filetes Dourados (Y = 1.75m, alinhada com capô e núcleo)
        const yS = 1.75;
        const hS = 0.24;
        group.add(buildContourStrip(yS + hS / 2, yS - hS / 2, 0.003, mats.creamStripe));
        group.add(buildContourStrip(yS + hS / 2 + 0.015, yS + hS / 2 - 0.015, 0.0045, mats.goldStripe));
        group.add(buildContourStrip(yS - hS / 2 + 0.015, yS - hS / 2 - 0.015, 0.0045, mats.goldStripe));

        // Faixa superior secundária na parte reta lateral (Upper Accent Stripe)
        const upperCream = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.09, sideWallLen - 0.06), mats.creamStripe);
        upperCream.position.set(xWall, 2.76, zCenterSide);
        group.add(upperCream);

        const upperGold = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, sideWallLen - 0.06), mats.goldStripe);
        upperGold.position.set(xGold, 2.71, zCenterSide);
        group.add(upperGold);

        // Janela Lateral Vertical do Studio Sleeper (mesmo estilo de cantos arredondados, guarnição de borracha e vidro escuro da janela superior)
        const doorZ = zSideFrontRef - 0.94;
        const winZ = doorZ;
        const winY = 2.28;
        const yVertWinBot = winY - 0.28;
        const yVertWinTop = winY + 0.28;
        const zVertWinRear = winZ - 0.26;
        const zVertWinFront = winZ + 0.26;

        group.add(buildRoundedSideVistaMesh(
            side,
            yVertWinBot,
            yVertWinTop,
            zVertWinRear,
            zVertWinFront,
            zVertWinFront,
            0.0025,
            mats.rubber
        ));
        group.add(buildRoundedSideVistaMesh(
            side,
            yVertWinBot + 0.012,
            yVertWinTop - 0.012,
            zVertWinRear + 0.012,
            zVertWinFront - 0.012,
            zVertWinFront - 0.012,
            0.0045,
            mats.glass
        ));

        // Janela Panorâmica Superior Lateral do Sleeper (Side Vista Window - ajustável em tempo real via janelaSuperiorSleeper)
        const ySideVistaBot = svPosY;
        const ySideVistaTop = svPosY + svDimY;
        const zSideVistaRear = svPosZ - svDimZ / 2;
        const zSideVistaFBot = svPosZ + svDimZ / 2;
        const frontSlant = Math.min(svDimZ * 0.75, svDimY * (0.365 / 0.255));
        const zSideVistaFTop = zSideVistaFBot - frontSlant;
        const rubberOut = svDimX * (0.0025 / 0.009);
        const glassOut = svDimX * 0.5;

        group.add(buildRoundedSideVistaMesh(
            side,
            ySideVistaBot,
            ySideVistaTop,
            zSideVistaRear,
            zSideVistaFBot,
            zSideVistaFTop,
            rubberOut,
            mats.rubber
        ));
        group.add(buildRoundedSideVistaMesh(
            side,
            ySideVistaBot + 0.012,
            ySideVistaTop - 0.012,
            zSideVistaRear + 0.012,
            zSideVistaFBot - 0.018,
            zSideVistaFTop - 0.014,
            glassOut,
            mats.glass
        ));

        // Porta do Bagageiro Inferior (Lower Storage Compartment Door) com trinco cromado
        const doorY = 1.28;
        const bagTrim = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.50, 0.52, 2, 0.02), mats.rubber);
        bagTrim.position.set(side * (wSleeper + 0.001), doorY, doorZ);
        group.add(bagTrim);

        const bagPanel = new THREE.Mesh(new RoundedBoxGeometry(0.015, 0.46, 0.48, 2, 0.015), mats.paint);
        bagPanel.position.set(side * (wSleeper + 0.002), doorY, doorZ);
        group.add(bagPanel);

        const bagLatch = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.09), mats.chrome);
        bagLatch.position.set(side * (wSleeper + 0.005), doorY - 0.14, doorZ);
        group.add(bagLatch);

        // Saia Inferior Cromada do Sleeper contornando toda a lateral, a quina arredondada de 10cm e a curva frontal até encontrar o Núcleo,
        // equipada com 4 Luzes Ovais Âmbar Realistas (moldura cromada abaulada + lente convexa âmbar)
        const skirtContour = [
            { absX: wSleeper, z: zRear, nx: 1, nz: 0 },
            ...contourXZ.slice(1)
        ];
        const sleeperSkirtSections = [];
        const ySkirtBot = yBot;          // 0.89m
        const ySkirtTop = yBot + 0.11;   // 1.00m
        const ySkirtMid = yBot + 0.055;  // 0.945m
        for (const pt of skirtContour) {
            const xIn = side * (pt.absX - 0.005 * pt.nx);
            const zIn = pt.z - 0.005 * pt.nz;
            const xOut = side * (pt.absX + 0.011 * pt.nx);
            const zOut = pt.z + 0.011 * pt.nz;
            const pts = [
                [xIn, ySkirtBot, zIn],
                [xIn, ySkirtTop, zIn],
                [xOut, ySkirtTop, zOut],
                [xOut, ySkirtBot, zOut]
            ];
            if (side > 0) pts.reverse();
            sleeperSkirtSections.push(pts);
        }
        group.add(new THREE.Mesh(createLoftedGeometry(sleeperSkirtSections, true, true, true, 0.45), mats.chrome));

        // 4 Luzes Ovais Âmbar na saia do sleeper (mantidas exatamente antes da linha verde em Z = -0.65m)
        const zCenterSkirtOrig = (0.725 + (-0.83)) / 2; // -0.0525m
        for (let k = -1.5; k <= 1.5; k += 1) {
            group.add(buildOvalMarkerLamp(
                side,
                side * (wSleeper + 0.011),
                ySkirtMid,
                zCenterSkirtOrig + k * 0.34,
                0,
                mats
            ));
        }

        // 11.3.5 Defletores de Ar Traseiros Laterais (Side Extenders) alongando o comprimento do sleeper para trás:
        //        - Emenda conectada em zRear (-0.65m, alinhada à linha verde) e extremidade traseira em -1.13m (deflLen = 0.48m),
        //          mantendo o comprimento total do conjunto da cabine + sleeper + defletor inalterado
        //        - Continuam harmoniosamente a pintura, as faixas branco-pérola/douradas, a saia cromada inferior (com 1 luz oval âmbar)
        //          e a curvatura superior do ombro do sleeper, além da aba preta vertical de borracha na borda traseira
        const deflLen = SLEEPER_DEFLECTOR_LEN;     // 0.48m
        const zDeflFront = zRear - 0.004;          // -0.654m (logo após a fresta/linha de junção em zRear = -0.65m)
        const zDeflRearBase = SLEEPER_DEFLECTOR_Z_REAR; // -1.130m
        const deflThick = 0.018;

        const getDeflRearZ = (yVal) => {
            if (yVal <= 2.50) return zDeflRearBase;
            const uTop = THREE.MathUtils.clamp((yVal - 2.50) / (3.325 - 2.50), 0, 1);
            return zDeflRearBase + 0.068 * Math.pow(uTop, 2.15);
        };

        // Estações verticais + curva do ombro superior (de Y = ySkirtTop = 1.00m até Y = 3.325m)
        const deflStations = [];
        const wallYList = [1.00, 1.35, 1.75, 2.15, 2.50, 2.70, 2.86, 3.05, yShoulderArcCenter];
        for (const yW of wallYList) {
            deflStations.push({
                absX: wSleeper,
                y: yW,
                nx: 1.0,
                ny: 0.0,
                zFront: zDeflFront,
                zRearEdge: getDeflRearZ(yW)
            });
        }
        const deflShoulderSteps = 6;
        const maxAlphaDefl = 0.38 * Math.PI;
        for (let s = 1; s <= deflShoulderSteps; s++) {
            const alpha = (s / deflShoulderSteps) * maxAlphaDefl;
            const cosA = Math.cos(alpha);
            const sinA = Math.sin(alpha);
            const absX = xShoulderStart + rShoulder * cosA;
            const ySVal = yShoulderArcCenter + rShoulder * sinA;
            // Acompanha o fillet traseiro superior do sleeper na junção frontal para não deixar fresta no topo
            const zFrontShoulder = zDeflFront + 0.036 * Math.pow(sinA, 1.6);
            deflStations.push({
                absX,
                y: ySVal,
                nx: cosA,
                ny: sinA,
                zFront: zFrontShoulder,
                zRearEdge: getDeflRearZ(ySVal)
            });
        }

        const deflSections = deflStations.map(st => {
            const xOut = side * st.absX;
            const yOut = st.y;
            const xIn = side * (st.absX - deflThick * st.nx);
            const yIn = st.y - deflThick * st.ny;
            const ring = [
                [xOut, yOut, st.zFront],
                [xOut, yOut, st.zRearEdge],
                [xIn,  yIn,  st.zRearEdge],
                [xIn,  yIn,  st.zFront]
            ];
            if (side < 0) ring.reverse();
            return ring;
        });
        group.add(new THREE.Mesh(createLoftedGeometry(deflSections, true, true, true, 0.45), mats.paint));

        // Linha vertical de junção/vedação escura (mats.rubber) entre o sleeper e o defletor traseiro em Z = zRear
        const seamSections = deflStations.map(st => {
            const xSeamIn = side * (st.absX - 0.004 * st.nx);
            const ySeamIn = st.y - 0.004 * st.ny;
            const xSeamOut = side * (st.absX + 0.0018 * st.nx);
            const ySeamOut = st.y + 0.0018 * st.ny;
            const zS = st.zFront + 0.002;
            const ring = [
                [xSeamOut, ySeamOut, zS + 0.003],
                [xSeamOut, ySeamOut, zS - 0.003],
                [xSeamIn,  ySeamIn,  zS - 0.003],
                [xSeamIn,  ySeamIn,  zS + 0.003]
            ];
            if (side < 0) ring.reverse();
            return ring;
        });
        group.add(new THREE.Mesh(createLoftedGeometry(seamSections, true, true, true, 0.35), mats.rubber));

        // Linha horizontal sutil de divisão da chapa superior do defletor (em Y = 2.86m, como na foto de referência)
        const zUpperSeamRear = getDeflRearZ(2.86);
        const upperPanelSeam = new THREE.Mesh(
            new THREE.BoxGeometry(0.004, 0.0045, (zDeflFront - zUpperSeamRear) - 0.004),
            mats.rubber
        );
        upperPanelSeam.position.set(side * (wSleeper + 0.0012), 2.86, (zDeflFront + zUpperSeamRear) * 0.5);
        group.add(upperPanelSeam);

        // Fileira vertical de pequenos rebites junto à borda frontal do defletor (Z = zRear - 0.018m)
        const deflRivetGeo = new THREE.SphereGeometry(0.0036, 8, 6);
        for (let yRiv = 1.08; yRiv <= 3.16; yRiv += 0.16) {
            const rivet = new THREE.Mesh(deflRivetGeo, mats.paint);
            rivet.scale.set(0.45, 1, 1);
            rivet.position.set(side * (wSleeper + 0.0015), yRiv, zRear - 0.018);
            group.add(rivet);
        }

        // Continuação harmoniosa da Saia Cromada Inferior sob o defletor (Y = 0.89m..1.00m) + 1 Luz Oval Âmbar
        const deflSkirtLen = (zDeflFront - 0.002) - zDeflRearBase;
        const deflSkirtZCenter = ((zDeflFront - 0.002) + zDeflRearBase) * 0.5;
        const deflSkirt = new THREE.Mesh(
            new RoundedBoxGeometry(0.016, ySkirtTop - ySkirtBot, deflSkirtLen, 2, 0.003),
            mats.chrome
        );
        deflSkirt.position.set(side * (wSleeper + 0.003), ySkirtMid, deflSkirtZCenter);
        group.add(deflSkirt);

        group.add(buildOvalMarkerLamp(
            side,
            side * (wSleeper + 0.011),
            ySkirtMid,
            deflSkirtZCenter,
            0,
            mats
        ));

        // Continuação harmoniosa da Faixa Principal Branco-Pérola + Filetes Dourados no defletor
        const deflStripeLen = (zDeflFront - 0.004) - (zDeflRearBase + 0.004);
        const deflStripeZ = ((zDeflFront - 0.004) + (zDeflRearBase + 0.004)) * 0.5;
        const deflMainCream = new THREE.Mesh(new THREE.BoxGeometry(0.005, hS, deflStripeLen), mats.creamStripe);
        deflMainCream.position.set(xWall, yS, deflStripeZ);
        group.add(deflMainCream);

        [-1, 1].forEach(sGold => {
            const deflGold = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.030, deflStripeLen), mats.goldStripe);
            deflGold.position.set(xGold, yS + sGold * (hS * 0.5), deflStripeZ);
            group.add(deflGold);
        });

        // Continuação harmoniosa da Faixa Superior Secundária (Upper Accent Stripe) no defletor
        const zRearAtUpperStripe = getDeflRearZ(2.76) + 0.006;
        const deflUpperLen = (zDeflFront - 0.004) - zRearAtUpperStripe;
        const deflUpperZ = ((zDeflFront - 0.004) + zRearAtUpperStripe) * 0.5;
        const deflUpperCream = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.09, deflUpperLen), mats.creamStripe);
        deflUpperCream.position.set(xWall, 2.76, deflUpperZ);
        group.add(deflUpperCream);

        const deflUpperGold = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, deflUpperLen), mats.goldStripe);
        deflUpperGold.position.set(xGold, 2.71, deflUpperZ);
        group.add(deflUpperGold);

        // Aba Vertical Preta de Borracha (mats.rubber) na borda traseira inferior/média do defletor (Y = 0.90m até Y = 2.48m, igual às fotos)
        const rubberFlapH = 2.48 - 0.90;
        const rubberFlapD = 0.044;
        const rearRubberFlap = new THREE.Mesh(
            new RoundedBoxGeometry(0.012, rubberFlapH, rubberFlapD, 2, 0.003),
            mats.rubber
        );
        rearRubberFlap.position.set(
            side * (wSleeper - 0.004),
            0.90 + rubberFlapH * 0.5,
            zDeflRearBase - rubberFlapD * 0.5 + 0.004
        );
        group.add(rearRubberFlap);

        // Suportes/nervuras horizontais internas na face de trás do sleeper prendendo o defletor (visíveis na 2ª foto)
        [1.04, 1.78, 2.46].forEach(yBrk => {
            const innerBrk = new THREE.Mesh(
                new RoundedBoxGeometry(0.065, 0.024, deflLen - 0.02, 2, 0.004),
                mats.paint
            );
            innerBrk.position.set(
                side * (wSleeper - deflThick - 0.028),
                yBrk,
                zRear - deflLen * 0.5
            );
            group.add(innerBrk);
        });
    });

    // 11.4 Parede Traseira do Sleeper: Janela Traseira
    const rearWinFrame = new THREE.Mesh(new RoundedBoxGeometry(0.84, 0.44, 0.02, 2, 0.02), mats.rubber);
    rearWinFrame.position.set(0, 2.30, zRear - 0.004);
    group.add(rearWinFrame);

    const rearWinGlass = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.36, 0.024), mats.glass);
    rearWinGlass.position.set(0, 2.30, zRear - 0.005);
    group.add(rearWinGlass);

    return group;
}

// ============================================================================
// 12. CAIXAS DE BATERIA COM DEGRAUS E TANQUES DE ALUMÍNIO POLIDO (2x 150 GAL)
// ============================================================================

function buildStepsAndFuelTanks(mats, zShift = 0) {
    const group = new THREE.Group();

    [-1, 1].forEach(side => {
        // 12.1 Conjunto Autêntico de Degraus de Acesso ao Núcleo Kenworth W900 (100% paralelo ao chassi):
        //      - Começa na frente (zFrontStep = 2.12m) alinhado exatamente à lateral do núcleo (xBase = getNucleoWidthAtLocalZ(2.12))
        //        e segue 100% paralelo ao chassi até zRearStep = 1.13m (dando a impressão de afundar no núcleo à medida que o núcleo alarga para trás).
        //      - Base inferior na mesma altura do solo que o tanque de combustível (yLowerLipBot = 0.230m = tankY - tankR).
        //      - Chapa lisa sob o cowl/capô (de Z = 2.12m até o arco traseiro do paralama dianteiro) acompanhando horizontalmente
        //        as laterais cônicas do núcleo e do capô.
        const zRearStep = 1.13 + zShift;
        const zFrontStep = 2.12 + zShift;
        const stepLen = zFrontStep - zRearStep;           // 0.99m
        const zStepCenter = (zRearStep + zFrontStep) / 2; // 1.625m

        const yTopBox = CHASSIS_Y_TOP;     // 0.890m (logo abaixo da saia cromada de 11cm com as 3 luzes ovais)
        const yUpperTread = 0.740;         // Altura do piso horizontal do degrau superior
        const yUpperLipBot = 0.696;        // Base da borda frontal vertical lisa do degrau superior
        const yMidCrease = 0.557;          // Vinco horizontal intermediário no espelho inclinado de chapa xadrez
        const yLowerTread = 0.374;         // Altura do piso horizontal do degrau inferior (movido 10 cm para cima: 0.274 -> 0.374m)
        const yLowerLipBot = 0.330;        // Base da borda frontal lisa do degrau inferior (movida 10 cm para cima: 0.230 -> 0.330m)

        // Coordenadas X 100% constantes ao longo de Z (toda a estrutura dos degraus é paralela ao chassi!)
        const xBase = getNucleoWidthAtLocalZ(zFrontStep - zShift) + 0.002; // ~0.6404m (alinhado à lateral do núcleo na parte da frente)
        const xBoxInner = 0.460;           // Face interna junto ao chassi
        const xUpperInner = xBase + 0.008; // ~0.6484m (base da faixa vertical superior de chapa xadrez / início do degrau superior)
        const xUpperOuter = xBase + 0.195; // ~0.8354m (borda frontal externa do degrau superior)
        const xRiserTop = xBase + 0.018;   // ~0.6584m (topo do espelho inclinado de chapa xadrez sob o degrau superior)
        const xRiserMid = xBase + 0.062;   // ~0.7024m (vinco central do espelho de chapa xadrez)
        const xLowerInner = xBase + 0.110; // ~0.7504m (início interno do piso do degrau inferior)
        const xLowerOuter = xBase + 0.300; // ~0.9404m (borda frontal externa do degrau inferior)

        // 12.1.1 Fechamento Traseiro Interno Paralelo ao Chassi (100% contido atrás da faixa superior xBase e do espelho inclinado, com normais externas)
        const backingProfileXY = [
            [xBoxInner, yTopBox],
            [xBase, yTopBox],
            [xBase, yUpperLipBot],
            [xRiserTop, yUpperLipBot],
            [xLowerInner - 0.004, yLowerLipBot + 0.006],
            [xBoxInner, yLowerLipBot + 0.006]
        ];
        const boxSections = [zRearStep + 0.004, zFrontStep - 0.004].map(zPos => {
            const ring = backingProfileXY.map(([ax, y]) => [side * ax, y, zPos]);
            if (side > 0) ring.reverse();
            return ring;
        });
        group.add(new THREE.Mesh(createLoftedGeometry(boxSections, true, true, true, 0.35), mats.polishedAluminum));

        // 12.1.2 Chapa Cromada sob o Cowl e Capô + Guarnição Fina de Borracha Preta (mats.rubber) nas junções com as estruturas em volta:
        //        Acompanha horizontalmente de forma exata a linha cônica das laterais do núcleo e do capô (getNucleoWidthAtLocalZ)
        //        desde a frente dos degraus (zFrontStep = 2.12m) até o arco traseiro do paralama dianteiro.
        const yPanelBot = DEFAULT_FENDER_PARAMS.posY + DEFAULT_FENDER_PARAMS.rearCutY; // 0.48m (base do corte traseiro do paralama dianteiro)
        const panelThick = 0.012;
        const cowlPanelSections = [];
        const fenderSeamPts = [];
        const cowlPanelSteps = 10;
        const zRearPanel = zFrontStep - 0.002;

        for (let i = 0; i <= cowlPanelSteps; i++) {
            const y = THREE.MathUtils.lerp(yPanelBot, yTopBox, i / cowlPanelSteps);
            const dyFender = y - DEFAULT_FENDER_PARAMS.posY;
            const rFender = DEFAULT_FENDER_PARAMS.cylinderRadius;
            const zFenderExactAtY = DEFAULT_FENDER_PARAMS.posZ - Math.sqrt(Math.max(0.01, rFender * rFender - dyFender * dyFender)) + zShift;
            const zFenderRearAtY = zFenderExactAtY + 0.015;

            const wOutRear = getNucleoWidthAtLocalZ(zRearPanel - zShift) + 0.002;
            const wOutFront = getNucleoWidthAtLocalZ(zFenderRearAtY - zShift) + 0.002;

            const ring = [
                [side * wOutRear, y, zRearPanel],
                [side * wOutFront, y, zFenderRearAtY],
                [side * (wOutFront - panelThick), y, zFenderRearAtY],
                [side * (wOutRear - panelThick), y, zRearPanel]
            ];
            if (side > 0) ring.reverse();
            cowlPanelSections.push(ring);

            const wSeamFront = getNucleoWidthAtLocalZ(zFenderExactAtY - zShift) + 0.0035;
            fenderSeamPts.push(new THREE.Vector3(side * wSeamFront, y, zFenderExactAtY));
        }
        group.add(new THREE.Mesh(createLoftedGeometry(cowlPanelSections, true, true, true, 0.4), mats.polishedAluminum));

        // Fina linha preta de borracha (mats.rubber) unindo a chapa cromada às estruturas em volta:
        // (a) Guarnição curva ao longo do arco traseiro do paralama dianteiro
        const rubberRadius = 0.0045;
        const fenderSeamCurve = new THREE.CatmullRomCurve3(fenderSeamPts);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(fenderSeamCurve, 16, rubberRadius, 8, false), mats.rubber));

        // (b) Guarnição horizontal superior entre a chapa cromada e a saia cromada (em Y = yTopBox = 0.89m)
        const topSeamStart = new THREE.Vector3(
            side * (getNucleoWidthAtLocalZ(zRearPanel - zShift) + 0.0035),
            yTopBox - 0.002,
            zRearPanel
        );
        const topSeamEnd = fenderSeamPts[fenderSeamPts.length - 1].clone();
        topSeamEnd.y = yTopBox - 0.002;
        const topSeamCurve = new THREE.LineCurve3(topSeamStart, topSeamEnd);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(topSeamCurve, 4, rubberRadius, 8, false), mats.rubber));

        // (c) Guarnição vertical traseira na junção com a estrutura dos degraus (em Z = zFrontStep)
        const rearSeamBot = new THREE.Vector3(
            side * (getNucleoWidthAtLocalZ(zRearPanel - zShift) + 0.0035),
            yPanelBot,
            zRearPanel
        );
        const rearSeamCurve = new THREE.LineCurve3(rearSeamBot, topSeamStart);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(rearSeamCurve, 4, rubberRadius, 8, false), mats.rubber));

        // (d) Emblema lateral "KW Bug" (mesmo símbolo do topo da grade frontal) aplicado na chapa cromada junto ao paralama dianteiro
        const zSideBug = 2.385 + zShift;
        const ySideBug = 0.785;
        const wSideBug = getNucleoWidthAtLocalZ(zSideBug - zShift) + 0.004;
        const coneSlopeAnglePanel = Math.atan2(CONE_W_END - CONE_W_START, HOOD_Z_START - NUCLEO_Z_END_WORLD);

        const sideBugGroup = new THREE.Group();
        sideBugGroup.position.set(side * wSideBug, ySideBug, zSideBug);
        sideBugGroup.rotation.y = side * (Math.PI / 2 - coneSlopeAnglePanel);
        sideBugGroup.scale.setScalar(0.78);

        // Medalhão circular vermelho e cromado
        const sideMedallionRim = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.016, 20), mats.chrome);
        sideMedallionRim.rotation.x = Math.PI / 2;
        sideBugGroup.add(sideMedallionRim);

        const sideMedallionRed = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.019, 20), mats.kwRedBadge);
        sideMedallionRed.rotation.x = Math.PI / 2;
        sideBugGroup.add(sideMedallionRed);

        const sideMedallionInnerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.021, 16), mats.chrome);
        sideMedallionInnerRing.rotation.x = Math.PI / 2;
        sideBugGroup.add(sideMedallionInnerRing);

        // Placa vertical com as 3 listras vermelhas verticais da Kenworth
        const sideBugStem = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.21, 0.014), mats.chrome);
        sideBugStem.position.set(0, -0.02, -0.002);
        sideBugGroup.add(sideBugStem);

        [-0.018, 0, 0.018].forEach(xStripe => {
            const sideRedBar = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.19, 0.017), mats.kwRedBadge);
            sideRedBar.position.set(xStripe, -0.02, 0);
            sideBugGroup.add(sideRedBar);
        });

        group.add(sideBugGroup);

        // 12.1.3 Chapa Xadrez Superior Contínua (100% paralela ao chassi):
        //        Faixa vertical superior (alinhada à frente do núcleo em xBase) + Piso horizontal do degrau superior (mats.diamondPlate)
        const tPlate = 0.005;
        const upperOuterPts = [
            [xBase, yTopBox],
            [xUpperInner - 0.002, yUpperTread + 0.006],
            [xUpperInner + 0.004, yUpperTread],
            [xUpperOuter - 0.004, yUpperTread]
        ];
        const upperInnerPts = upperOuterPts.slice().reverse().map(([ax, y]) => [ax - tPlate * 0.6, y - tPlate]);
        const upperProfileXY = [...upperOuterPts, ...upperInnerPts];
        const upperDiamondSections = [zRearStep + 0.002, zFrontStep - 0.002].map(z => {
            const loop = upperProfileXY.map(([ax, y]) => [side * ax, y, z]);
            if (side > 0) loop.reverse();
            return loop;
        });
        group.add(new THREE.Mesh(createLoftedGeometry(upperDiamondSections, true, true, true, 0.45), mats.diamondPlate));

        // 12.1.4 Chapa Xadrez Inferior Contínua (100% paralela ao chassi):
        //        Espelho central inclinado com vinco + Piso horizontal do degrau inferior (mats.diamondPlate)
        const lowerOuterPts = [
            [xRiserTop, yUpperTread - 0.005],
            [xRiserMid, yMidCrease],
            [xLowerInner - 0.004, yLowerTread + 0.008],
            [xLowerInner + 0.008, yLowerTread],
            [xLowerOuter - 0.004, yLowerTread]
        ];
        const lowerInnerPts = lowerOuterPts.slice().reverse().map(([ax, y]) => [ax - tPlate * 0.6, y - tPlate]);
        const lowerProfileXY = [...lowerOuterPts, ...lowerInnerPts];
        const lowerDiamondSections = [zRearStep + 0.005, zFrontStep - 0.005].map(z => {
            const loop = lowerProfileXY.map(([ax, y]) => [side * ax, y, z]);
            if (side > 0) loop.reverse();
            return loop;
        });
        group.add(new THREE.Mesh(createLoftedGeometry(lowerDiamondSections, true, true, true, 0.45), mats.diamondPlate));

        // 12.1.5 Bordas Frontais Verticais Lisas (Polished Nosing Lips) dos Degraus Superior e Inferior (100% paralelas ao chassi)
        const upperLip = new THREE.Mesh(
            new RoundedBoxGeometry(0.012, yUpperTread - yUpperLipBot + 0.002, stepLen + 0.004, 2, 0.003),
            mats.polishedAluminum
        );
        upperLip.position.set(side * (xUpperOuter - 0.003), (yUpperTread + yUpperLipBot) / 2, zStepCenter);
        group.add(upperLip);

        const lowerLip = new THREE.Mesh(
            new RoundedBoxGeometry(0.012, yLowerTread - yLowerLipBot + 0.002, stepLen + 0.004, 2, 0.003),
            mats.polishedAluminum
        );
        lowerLip.position.set(side * (xLowerOuter - 0.003), (yLowerTread + yLowerLipBot) / 2, zStepCenter);
        group.add(lowerLip);

        // 12.1.6 Abas Laterais Diagonais Lisas de Fechamento (Side End-Plates) nas duas extremidades (alinhadas atrás em xBase, sentido horário em (ax,y) -> normais externas)
        const endPlateThick = 0.006;
        const sidePlateProfileXY = [
            [xBase, yUpperLipBot - 0.002],
            [xUpperOuter - 0.028, yUpperLipBot - 0.010],
            [xLowerOuter, yLowerTread + 0.003],
            [xLowerOuter, yLowerLipBot],
            [xBase, yLowerLipBot]
        ];

        [zRearStep + endPlateThick / 2, zFrontStep - endPlateThick / 2].forEach((zPlate, idx) => {
            const z0 = zPlate - endPlateThick / 2;
            const z1 = zPlate + endPlateThick / 2;
            const sec0 = sidePlateProfileXY.map(([ax, y]) => [side * ax, y, z0]);
            const sec1 = sidePlateProfileXY.map(([ax, y]) => [side * ax, y, z1]);
            if (side > 0) {
                sec0.reverse();
                sec1.reverse();
            }
            group.add(new THREE.Mesh(createLoftedGeometry([sec0, sec1], true, true, true, 0.35), mats.polishedAluminum));

            // 3 parafusos sextavados na aba lateral
            const zBoltOut = idx === 0 ? z0 - 0.002 : z1 + 0.002;
            const boltGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 6);
            boltGeo.rotateX(Math.PI / 2);
            [
                [xLowerInner - 0.012, 0.405],
                [xRiserMid + 0.012, 0.520],
                [xRiserTop + 0.018, 0.635]
            ].forEach(([bx, by]) => {
                const bolt = new THREE.Mesh(boltGeo, mats.chrome);
                bolt.position.set(side * bx, by, zBoltOut);
                group.add(bolt);
            });
        });

        // 12.1.7 Dois Suportes Sob as Extremidades do Degrau Superior + 2 Travas Circulares Superiores (paralelas ao chassi em xBase)
        [zRearStep + 0.048, zFrontStep - 0.048].forEach(zBrk => {
            const gusset = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.046, 0.016, 2, 0.004), mats.polishedAluminum);
            gusset.position.set(side * (xUpperOuter - 0.036), yUpperLipBot - 0.016, zBrk);
            group.add(gusset);

            const frontFastener = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 8), mats.chrome);
            frontFastener.rotation.z = Math.PI / 2;
            frontFastener.position.set(side * (xUpperOuter - 0.008), yUpperLipBot - 0.012, zBrk);
            group.add(frontFastener);

            // Trava circular superior na faixa vertical de chapa xadrez (em X constante = xBase + 0.006, 100% paralela ao chassi)
            const xLatch = xBase + 0.006;
            const latchRing = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 14), mats.rubber);
            latchRing.rotation.z = Math.PI / 2;
            latchRing.position.set(side * xLatch, yTopBox - 0.038, zBrk);
            group.add(latchRing);

            const latchBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.011, 10), mats.chrome);
            latchBolt.rotation.z = Math.PI / 2;
            latchBolt.position.set(side * (xLatch + 0.002), yTopBox - 0.038, zBrk);
            group.add(latchBolt);
        });

        // 12.2 Tanque Cilíndrico de Alumínio Polido (diâmetro = 0.66m, estendido até coincidir com a extremidade traseira vermelha do defletor em Z = -1.13m,
        //      com extremidades fechadas e achatadas de bordas arredondadas sem quinas vivas)
        const tankD = 0.66;
        const tankR = tankD / 2; // 0.33m
        const zSleeperSideFront = 0.83;                             // 0.83m (extremidade dianteira do tanque)
        const zTankRear = SLEEPER_DEFLECTOR_Z_REAR;                 // -1.13m (coincide exatamente com a extremidade traseira vermelha do defletor)
        const tankTotalLen = zSleeperSideFront - zTankRear;         // 1.96m (de +0.83m até -1.13m)
        const tankZ = (zSleeperSideFront + zTankRear) / 2 + zShift; // -0.15m
        const tankX = side * (SLEEPER_HALF_W - tankR);              // ±0.860m (mantém diâmetro de 0.66m e alinha face externa com o sleeper em ±1.190m)
        const tankY = CHASSIS_Y_TOP - tankR; // 0.89 - 0.33 = 0.56m (topo do tanque em Y = 0.89m, alinhado ao topo do chassi)

        const cornerR = 0.065; // Raio de adoçamento das bordas da base e do topo (sem quinas vivas)
        const rFlat = tankR - cornerR;
        const halfL = tankTotalLen / 2;
        const lathePts = [];

        // Base traseira achatada (h = -halfL)
        lathePts.push(new THREE.Vector2(0.0, -halfL));
        lathePts.push(new THREE.Vector2(rFlat * 0.6, -halfL));
        lathePts.push(new THREE.Vector2(rFlat * 0.98, -halfL));

        // Borda arredondada traseira (transição suave de 90° entre a face achatada e o corpo cilíndrico)
        const filletSteps = 10;
        for (let i = 0; i <= filletSteps; i++) {
            const a = -Math.PI / 2 + (i / filletSteps) * (Math.PI / 2);
            lathePts.push(new THREE.Vector2(
                rFlat + cornerR * Math.cos(a),
                (-halfL + cornerR) + cornerR * Math.sin(a)
            ));
        }

        // Corpo cilíndrico reto de 0.66m de diâmetro
        lathePts.push(new THREE.Vector2(tankR, -halfL + cornerR + 0.003));
        lathePts.push(new THREE.Vector2(tankR, halfL - cornerR - 0.003));

        // Borda arredondada dianteira (transição suave de 90° entre o corpo cilíndrico e o topo achatado)
        for (let i = 0; i <= filletSteps; i++) {
            const a = (i / filletSteps) * (Math.PI / 2);
            lathePts.push(new THREE.Vector2(
                rFlat + cornerR * Math.cos(a),
                (halfL - cornerR) + cornerR * Math.sin(a)
            ));
        }

        // Topo dianteiro achatado (h = +halfL)
        lathePts.push(new THREE.Vector2(rFlat * 0.98, halfL));
        lathePts.push(new THREE.Vector2(rFlat * 0.6, halfL));
        lathePts.push(new THREE.Vector2(0.0, halfL));

        const tankGeo = new THREE.LatheGeometry(lathePts, 28);
        tankGeo.rotateX(Math.PI / 2);
        const tankMesh = new THREE.Mesh(tankGeo, mats.polishedAluminum);
        tankMesh.position.set(tankX, tankY, tankZ);
        group.add(tankMesh);

        // 4 Cintas de Fixação de Inox com Forro de Borracha Preta (Tank Straps) distribuídas ao longo do tanque de 1.96m
        [-0.72, -0.24, 0.24, 0.72].forEach(dz => {
            const rubberLiner = new THREE.Mesh(
                new THREE.CylinderGeometry(tankR + 0.006, tankR + 0.006, 0.048, 24),
                mats.rubber
            );
            rubberLiner.rotation.x = Math.PI / 2;
            rubberLiner.position.set(tankX, tankY, tankZ + dz);
            group.add(rubberLiner);

            const chromeBand = new THREE.Mesh(
                new THREE.CylinderGeometry(tankR + 0.010, tankR + 0.010, 0.032, 24),
                mats.chrome
            );
            chromeBand.rotation.x = Math.PI / 2;
            chromeBand.position.set(tankX, tankY, tankZ + dz);
            group.add(chromeBand);
        });

        // Bocal de Abastecimento com Tampa Cromada (rotacionado no eixo Z do tanque para que seu ponto mais alto fique 2 cm abaixo da base do sleeper em Y = 0.87m)
        const fillerR = 0.045;
        const fillerLen = 0.08;
        const fillerTipR = tankR + 0.035; // 0.365m do eixo do tanque até a face externa da tampa
        const fillerCenterR = fillerTipR - fillerLen / 2; // 0.325m
        const fillerAngleZ = 0.6908; // ~39.6°: tankY + fillerTipR*cos(theta) + fillerR*sin(theta) = 0.87m = CHASSIS_Y_TOP - 0.02m
        const fillerNeck = new THREE.Mesh(new THREE.CylinderGeometry(fillerR, fillerR, fillerLen, 12), mats.chrome);
        fillerNeck.position.set(
            tankX + side * fillerCenterR * Math.sin(fillerAngleZ),
            tankY + fillerCenterR * Math.cos(fillerAngleZ),
            zSleeperSideFront - 0.38 + zShift
        );
        fillerNeck.rotation.z = -side * fillerAngleZ;
        group.add(fillerNeck);
    });

    return group;
}

// ============================================================================
// 13. PASSADIÇO (CATWALK), QUARTER FENDERS INOX E BARRA DE LUZES TRASEIRA
// ============================================================================

function buildRearTaillightsAssembly(mats, chassiParams = DEFAULT_CABIN_ELEMENTS_PARAMS.chassi) {
    const group = new THREE.Group();

    // Referência de posição: extremidade traseira do chassi (zRearChassis = posZ - dimZ/2, centro vertical = posY + dimY/2)
    const zRearChassis = chassiParams.posZ - chassiParams.dimZ * 0.5;
    const zRearAssy = zRearChassis + 0.06; // Embutido nas abas em C traseiras do chassi, com lentes/saliência alinhadas a zRearChassis
    const xCenter = chassiParams.posX;
    const lightBoxW = 0.73;
    const lightBoxH = 0.27;
    const lightBoxY = chassiParams.posY + chassiParams.dimY * 0.5; // Centro vertical exato das longarinas (0.835m para posY=0.67m, dimY=0.33m)

    const rearLightBox = new THREE.Mesh(
        new RoundedBoxGeometry(lightBoxW, lightBoxH, 0.065, 2, 0.008),
        mats.chassis
    );
    rearLightBox.position.set(xCenter, lightBoxY, zRearAssy);
    group.add(rearLightBox);

    // 4 Faroletes Traseiros Redondos com Moldura Preta de Borracha (2 Vermelhos nas pontas + 2 Brancos internos)
    const grommetGeo = new THREE.CylinderGeometry(0.056, 0.058, 0.018, 24);
    grommetGeo.rotateX(Math.PI / 2);
    const grommetLipGeo = new THREE.TorusGeometry(0.049, 0.007, 12, 24);
    const lensR = 0.045;
    const lensGeo = new THREE.SphereGeometry(lensR, 24, 16);
    {
        // UVs planares circulares (XY) para projetar a textura tripartida do farolete sem distorção polar na face traseira (-Z)
        const posAttr = lensGeo.attributes.position;
        const uvAttr = lensGeo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vy = posAttr.getY(i);
            uvAttr.setXY(
                i,
                THREE.MathUtils.clamp(0.5 + vx / (2.0 * lensR), 0.02, 0.98),
                THREE.MathUtils.clamp(0.5 + vy / (2.0 * lensR), 0.02, 0.98)
            );
        }
        uvAttr.needsUpdate = true;
    }

    [
        { x: -0.250, isRed: true },
        { x: -0.112, isRed: false },
        { x:  0.112, isRed: false },
        { x:  0.250, isRed: true }
    ].forEach(({ x, isRed }) => {
        const grommet = new THREE.Mesh(grommetGeo, mats.rubber);
        grommet.position.set(xCenter + x, lightBoxY, zRearAssy - 0.026);
        group.add(grommet);

        const grommetLip = new THREE.Mesh(grommetLipGeo, mats.rubber);
        grommetLip.scale.set(1.0, 1.0, 0.65);
        grommetLip.position.set(xCenter + x, lightBoxY, zRearAssy - 0.035);
        group.add(grommetLip);

        const lampLens = new THREE.Mesh(lensGeo, isRed ? mats.redTailLamp : mats.clearReverseLamp);
        lampLens.scale.set(1.0, 1.0, 0.28);
        lampLens.position.set(xCenter + x, lightBoxY, zRearAssy - 0.034);
        group.add(lampLens);
    });

    // Saliência central prateada/cromada arredondada entre os dois faroletes brancos
    const centerBumperLug = new THREE.Mesh(
        new RoundedBoxGeometry(0.086, 0.034, 0.046, 3, 0.010),
        mats.polishedAluminum
    );
    centerBumperLug.position.set(xCenter, lightBoxY - 0.028, zRearAssy - 0.036);
    group.add(centerBumperLug);

    return group;
}

function buildCatwalkDeckPlate(mats, catwalkParams = DEFAULT_CABIN_ELEMENTS_PARAMS.chapaPassadico) {
    const group = new THREE.Group();
    const deckPlate = new THREE.Mesh(
        new THREE.BoxGeometry(catwalkParams.dimX, catwalkParams.dimY, catwalkParams.dimZ),
        mats.diamondPlate
    );
    deckPlate.position.set(
        catwalkParams.posX,
        catwalkParams.posY + catwalkParams.dimY * 0.5,
        catwalkParams.posZ
    );
    group.add(deckPlate);
    return group;
}

function buildCatwalkQuarterFendersAndRear(mats, zShift = 0) {
    const group = new THREE.Group();

    // 13.1 Degraus laterais de acesso ao passadiço (posicionados entre o fim do tanque em -1.13m e o para-lama traseiro em -1.59m)
    [-1, 1].forEach(side => {
        const deckStep = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.025, 0.32), mats.diamondPlate);
        deckStep.position.set(side * 0.52, CHASSIS_FRAME_Y_TOP - 0.14, -1.35);
        group.add(deckStep);
    });

    // 13.2 Meios-Para-lamas Traseiros Cromados (Stainless Quarter Fenders) escalados proporcionalmente para a nova largura de 2.38m
    [-1, 1].forEach(side => {
        const qDepth = 0.62 * CAB_WIDTH_SCALE; // ~0.706m (largura proporcional do para-lama traseiro)
        const qX = side * (0.725 * CAB_WIDTH_SCALE); // Centro alinhado ao par de pneus duplos na nova largura de 2.38m
        // Arco de 75 graus cobrindo a frente dos pneus duplos dianteiros (Z = -2.15)
        const qShape = new THREE.Shape();
        const rOut = 0.62;
        const rIn = 0.58;
        qShape.absarc(0, 0, rOut, -Math.PI * 0.05, Math.PI * 0.38, false);
        qShape.absarc(0, 0, rIn, Math.PI * 0.38, -Math.PI * 0.05, true);
        qShape.closePath();

        const qGeo = new THREE.ExtrudeGeometry(qShape, {
            steps: 1,
            depth: qDepth,
            bevelEnabled: true,
            bevelThickness: 0.01,
            bevelSize: 0.01,
            bevelSegments: 2,
            curveSegments: 14
        });
        qGeo.rotateY(-Math.PI / 2);
        const qMesh = new THREE.Mesh(qGeo, mats.chrome);
        qMesh.position.set(qX + qDepth * 0.5, 0.52, -2.15);
        group.add(qMesh);

        // Tubo de suporte estrutural preso diretamente à alma da longarina do chassi (|X|=0.38m, Y=0.78m)
        // e conectado sem frestas à face frontal do para-lama traseiro (em Z ≈ -1.615m)
        const yMount = 0.78;
        const zFenderAtMount = -2.15 + Math.sqrt(Math.max(0.01, 0.595 * 0.595 - (yMount - 0.52) * (yMount - 0.52))); // ~ -1.615m
        const zTube = zFenderAtMount + 0.024; // ~ -1.591m (encostado na face frontal do para-lama)

        // Flange presa na lateral da longarina do chassi (|X| = 0.38m)
        const frameBracket = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.11, 0.11, 2, 0.005), mats.chassis);
        frameBracket.position.set(side * 0.388, yMount, zTube);
        group.add(frameBracket);

        // Tubo horizontal cromado saindo da longarina (|X|=0.37m) até o para-lama (|X|=0.96 * CAB_WIDTH_SCALE)
        const xTubeEnd = 0.96 * CAB_WIDTH_SCALE;
        const tubeLen = xTubeEnd - 0.37;
        const mountTube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, tubeLen, 14), mats.chrome);
        mountTube.rotation.z = Math.PI / 2;
        mountTube.position.set(side * (0.37 + tubeLen / 2), yMount, zTube);
        group.add(mountTube);

        // Suporte/abraçadeira cromada unindo fisicamente o tubo de suporte ao arco do para-lama traseiro
        const clampCollar = new THREE.Mesh(
            new RoundedBoxGeometry(0.52 * CAB_WIDTH_SCALE, 0.068, 0.068, 2, 0.008),
            mats.chrome
        );
        clampCollar.position.set(side * (0.71 * CAB_WIDTH_SCALE), yMount, (zTube + zFenderAtMount) * 0.5 - 0.008);
        clampCollar.rotation.x = 0.42;
        group.add(clampCollar);
    });

    // 13.3 Suportes Pretos Cônicos das Lameiras + Faixa Refletiva Vermelha/Branca (4 gomos) + Lameiras Pretas Lisas (escaladas para 2.38m)
    const zRearAssy = CHASSIS_Z_REAR + 0.06;
    [-1, 1].forEach(side => {
        const xInner = 0.405 * CAB_WIDTH_SCALE;
        const xOuter = 1.045 * CAB_WIDTH_SCALE; // 1.190m
        const flapW = xOuter - xInner; // ~0.729m
        const mX = side * ((xInner + xOuter) * 0.5);

        // 1. Chapa/nervura vertical preta presa à lateral externa da longarina do chassi (|X| = 0.39m)
        const frameGusset = new THREE.Mesh(
            new RoundedBoxGeometry(0.020, 0.24, 0.14, 2, 0.006),
            mats.chassis
        );
        frameGusset.position.set(side * 0.392, 0.78, zRearAssy + 0.02);
        group.add(frameGusset);

        // 2. Braço superior preto cônico/afilado (mais alto junto ao chassi e afilando até a ponta externa da lameira)
        const makeArmSection = (absX, yTopArm, yBotArm, zHalf) => {
            const x = side * absX;
            const ring = [
                [x, yBotArm, zRearAssy - zHalf],
                [x, yBotArm, zRearAssy + zHalf],
                [x, yTopArm, zRearAssy + zHalf * 0.7],
                [x, yTopArm, zRearAssy - zHalf * 0.7]
            ];
            if (side > 0) ring.reverse();
            return ring;
        };
        const armSections = [
            makeArmSection(0.395, 0.805, 0.680, 0.030),
            makeArmSection(xOuter + 0.003, 0.722, 0.680, 0.022)
        ];
        group.add(new THREE.Mesh(createLoftedGeometry(armSections, true, true, true, 0.45), mats.chassis));

        // 3. Barra horizontal preta porta-refletor logo abaixo do braço cônico (Y = 0.652m)
        const yReflectorBar = 0.652;
        const reflectorBarH = 0.048;
        const reflectorHolder = new THREE.Mesh(
            new RoundedBoxGeometry(flapW + 0.006, reflectorBarH, 0.026, 2, 0.004),
            mats.chassis
        );
        reflectorHolder.position.set(mX, yReflectorBar, zRearAssy);
        group.add(reflectorHolder);

        // 4. Faixa Refletiva Traseira com 4 segmentos alternados (Vermelho / Branco / Vermelho / Branco, igual à foto)
        const segW = flapW / 4;
        for (let s = 0; s < 4; s++) {
            // Na foto, indo da esquerda (+X) para a direita (-X) em ambos os lados: Vermelho, Branco, Vermelho, Branco
            const xSegCenter = (side > 0 ? xOuter : -xInner) - (s + 0.5) * segW;
            const isRedSeg = (s % 2 === 0);
            const segMesh = new THREE.Mesh(
                new THREE.BoxGeometry(segW - 0.002, 0.040, 0.006),
                isRedSeg ? mats.kwRedBadge : mats.creamStripe
            );
            segMesh.position.set(xSegCenter, yReflectorBar, zRearAssy - 0.012);
            group.add(segMesh);
        }

        // 5. Lameira Preta Lisa (Plain Black Mudflap, sem pesos cromados nem logos, exatamente como na foto)
        const flapH = 0.50;
        const mudflap = new THREE.Mesh(
            new THREE.BoxGeometry(flapW, flapH, 0.016),
            mats.rubber
        );
        mudflap.position.set(mX, yReflectorBar - reflectorBarH * 0.5 - flapH * 0.5 + 0.004, zRearAssy);
        group.add(mudflap);
    });

    // 13.4 Luzes Traseiras de Trabalho (mantêm suas dimensões e acompanham a largura do sleeper), Haste "Pogo Stick" e Mangueiras Espirais atrás do Sleeper
    const zRearSleeper = SLEEPER_Z_REAR;
    [-0.68 * CAB_WIDTH_SCALE, 0.68 * CAB_WIDTH_SCALE].forEach(xWork => {
        const workHousing = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.09, 0.06, 2, 0.01), mats.chrome);
        workHousing.position.set(xWork, 2.92, zRearSleeper - 0.02);
        group.add(workHousing);

        const workLens = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.068, 0.064), mats.clearReverseLamp);
        workLens.position.set(xWork, 2.92, zRearSleeper - 0.022);
        group.add(workLens);
    });

    const hoseConfigs = [
        { x: -0.22, mat: mats.airLineBlue },
        { x: 0.00, mat: mats.airLineGreen },
        { x: 0.22, mat: mats.airLineRed }
    ];
    hoseConfigs.forEach(cfg => {
        const gladhand = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 8), mats.chrome);
        gladhand.rotation.x = Math.PI / 2;
        gladhand.position.set(cfg.x, 1.84, zRearSleeper - 0.02);
        group.add(gladhand);

        for (let c = 0; c < 6; c++) {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 12), cfg.mat);
            coil.position.set(cfg.x, 1.72 - c * 0.055, zRearSleeper - 0.10 - c * 0.018);
            coil.rotation.x = 0.45;
            group.add(coil);
        }
    });

    return group;
}

// ============================================================================
// BAKING AUTOMÁTICO DE GEOMETRIAS POR MATERIAL (ALTA PERFORMANCE)
// ============================================================================

/**
 * Mescla todas as sub-malhas estáticas do caminhão que compartilham o mesmo Material
 * em um único BufferGeometry por material (~18 draw calls para toda a W900L esculpida).
 * Malhas opacas são adicionadas primeiro e malhas translúcidas (vidros) por último.
 */
function bakeStaticMeshesByMaterial(rootGroup) {
    rootGroup.updateMatrixWorld(true);
    const buckets = new Map();

    rootGroup.traverse((child) => {
        if (!child.isMesh || !child.geometry || Array.isArray(child.material)) return;
        const mat = child.material;

        const geom = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        if (!geom.attributes.position) return;
        if (!geom.attributes.normal) {
            geom.computeVertexNormals();
        }
        const vertexCount = geom.attributes.position.count;
        if (!geom.attributes.uv) {
            geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
        }
        for (const attrName of Object.keys(geom.attributes)) {
            if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
                geom.deleteAttribute(attrName);
            }
        }
        geom.clearGroups();
        geom.applyMatrix4(child.matrixWorld);

        if (!buckets.has(mat)) {
            buckets.set(mat, { geoms: [], castShadow: true });
        }
        const entry = buckets.get(mat);
        entry.geoms.push(geom);
        if (child.castShadow === false) {
            // Mantém sombra ativa caso qualquer peça principal do material projete sombra
        }
    });

    const bakedGroup = new THREE.Group();
    const transparentMeshes = [];

    for (const [mat, entry] of buckets.entries()) {
        const merged = BufferGeometryUtils.mergeGeometries(entry.geoms, false);
        entry.geoms.forEach(g => g.dispose());
        if (!merged) continue;

        const mesh = new THREE.Mesh(merged, mat);
        if (mat.transparent) {
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.renderOrder = 2;
            transparentMeshes.push(mesh);
        } else {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            bakedGroup.add(mesh);
        }
    }

    transparentMeshes.forEach(m => bakedGroup.add(m));
    return bakedGroup;
}
