export function createSunVisor(width, vAngle, xAngle) {
    const visorGroup = new THREE.Group();

    const panelWidth = width / 2;  // 10 => 0.95
    const panelHeight = panelWidth / 2;
    const panelDepth = 0.02;
    const lightCountPerSide = 4;
    const lightRadius = 0.02;
    const lightSpacing = panelWidth / lightCountPerSide;
    const endCapWidth = 0.10;

    const panelGeometry = new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth);
    const endCapGeometry = new THREE.BoxGeometry(endCapWidth, panelHeight, panelDepth);
    const lightGeometry = new THREE.SphereGeometry(lightRadius, 16, 8);
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff8c00,       // Cor laranja/âmbar
        emissive: 0xff8c00,    // Cor da emissão (brilho)
        emissiveIntensity: 3,  // Intensidade do brilho
        toneMapped: false      // Evita que o tone mapping afete o brilho
    });

    const chromeMaterial = new THREE.MeshStandardMaterial({
        color: 0xe0e0e0, // Cor base prateada
        metalness: 1.0,    // Totalmente metálico
        roughness: 0.0,   // Superfície bem polida/reflexiva
        envMapIntensity: 1.0
    });

    // --- Criação dos Painéis (Esquerdo e Direito) ---
    ['left', 'right'].forEach(side => {
        const panel = new THREE.Mesh(panelGeometry, chromeMaterial);

        // Adding lights
        for (let i = 0; i < lightCountPerSide; i++) {
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            const xPosition = (i - (lightCountPerSide - 1) / 2) * lightSpacing;
            light.position.set(xPosition, -panelHeight / 2 + 0.03, panelDepth / 2);
            panel.add(light);
        }

        const endCap = new THREE.Mesh(endCapGeometry, chromeMaterial);
        endCap.position.z = -endCapWidth / 2;
        panel.add(endCap); // Adiciona o endCap como filho do painel

        // 4. Cria um "pivô". Este é um truque para rotacionar o painel
        // a partir da sua extremidade, em vez do seu centro.
        const pivot = new THREE.Group();
        pivot.add(panel);
        visorGroup.add(pivot);

        let posX = panelWidth / 2;
        let angle = vAngle;
        if (side === 'left') {
            posX = -posX;
            angle = -angle;
        }
        panel.position.x = posX;
        endCap.position.x = posX;
        endCap.rotation.y = THREE.MathUtils.degToRad(90 - angle);
        pivot.rotation.y = THREE.MathUtils.degToRad(angle);
        pivot.rotation.x = THREE.MathUtils.degToRad(-xAngle);

    });
    return visorGroup;
}
