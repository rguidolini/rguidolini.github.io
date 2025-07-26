export class LevelManager {
    constructor(uiElements, camera, truck) {
        this.gameEnded = false;
        this.numLevels = 3;
        this.currentLevel = 1;
        this.ui = uiElements;
        this.camera = camera;
        this.truck = truck;
        this.checkSuccessFunction = null;
    }

    Ended() {
        return this.gameEnded;
    }

    setupLevel() {
        if (this.currentLevel > this.numLevels) {
            return false;
        }
        this.gameEnded = false;
        this.ui.msgBox.style.display = 'none';
        if (this.currentLevel === 1) this.setupLevel1();
        if (this.currentLevel === 2) this.setupLevel2();
        if (this.currentLevel === 3) this.setupLevel3();
        return true;
    }

    checkSuccess() {
        return this.checkSuccessFunction();
    }

    simpleParking() {
        const chassisBody = this.truck.vehicle.chassisBody;
        const pos = chassisBody.position;
        const quat = chassisBody.quaternion;
        const speed = chassisBody.velocity.length();
        const angleY = 2 * Math.atan2(quat.y, quat.w);
        const isInParkingZone = Math.abs(pos.x) < 0.5 && Math.abs(pos.z) < 0.5;
        if (isInParkingZone) {
            if (speed < 0.1 && Math.abs(angleY) < 0.2) {
                this.passedLevel("You parked successfuly!");
            }
        }
    }

    setupLevel1() {
        this.ui.infoTitle.innerText = "Fase 1: Baliza Simples";
        this.ui.infoDescription.innerText = "Alinhe e estacione o caminhão na vaga.";

        this.truck.reset(0, 4, -10, 0);

        this.checkSuccessFunction = this.simpleParking;
    }

    setupLevel2() {
        this.ui.infoTitle.innerText = "Fase 2: Manobra de 90 Graus";
        this.ui.infoDescription.innerText = "Alinhe e estacione o caminhão na vaga.";

        this.truck.reset(20, 4, -20, -Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.Reset();

        this.checkSuccessFunction = this.simpleParking;
    }

    setupLevel3() {
        this.ui.infoTitle.innerText = "Fase 3: Estacione de re";
        this.ui.infoDescription.innerText = "Alinhe e estacione o caminhão na vaga de re.";

        this.truck.reset(0, 4, -10, 0);
        this.camera.SwitchTo("orbital");
        this.camera.Reset();

        this.checkSuccessFunction = () => {
            const chassisBody = this.truck.vehicle.chassisBody;
            const pos = chassisBody.position;
            const quat = chassisBody.quaternion;
            const speed = chassisBody.velocity.length();
            const angleY = 2 * Math.atan2(quat.y, quat.w);
            const isInParkingZone = Math.abs(pos.x) < 0.5 && Math.abs(pos.z) < 0.5;
            if (isInParkingZone) {
                if (speed < 0.1 && Math.abs(angleY) > 3.12 && Math.abs(angleY) < 3.16) {
                    this.passedLevel("You are the King of the Road!\nPlay again?");
                }
            }
        }
    }

    passedLevel(reason) {
        let nextLevel = this.currentLevel + 1;
        if (nextLevel > this.numLevels) {
            nextLevel = 1;
        }
        this.gameEnded = true;
        this.truck.freeze();
        this.ui.msgBox.className = 'message-box';
        this.ui.msgText.innerText = 'Congratulations!\n' + reason;
        this.ui.actionButton.innerText = "Start Level " + nextLevel;
        this.ui.actionButton.onclick = () => {
            this.currentLevel = nextLevel;
            this.setupLevel();
        };
        this.ui.infoPanel.style.display = 'block';
        this.ui.msgBox.style.display = 'block';
    }

    failedLevel(reason) {
        this.gameEnded = true;
        this.truck.freeze();
        this.ui.msgText.innerText = 'Level failed!\n' + reason;
        this.ui.msgBox.className = 'message-box fail';
        this.ui.msgBox.style.display = 'block';
        this.ui.actionButton.innerText = "Try again";
        this.ui.actionButton.onclick = () => this.setupLevel();
    }
}
