export class LevelManager {
    constructor(uiElements, camera, truck, trunk_trailer, keyboardController, scenario) {
        this.gameEnded = false;
        this.numLevels = 5;
        this.currentLevel = 1;
        this.ui = uiElements;
        this.camera = camera;
        this.truck = truck;
        this.trunk_trailer = trunk_trailer;
        this.keyboardController = keyboardController;
        this.scenario = scenario;
        this.checkSuccessFunction = null;
        this.attempty = 1;
    }

    Ended() {
        return this.gameEnded;
    }

    setupLevel() {
        if (this.currentLevel > this.numLevels) {
            return false;
        }
        this.gameEnded = false;
        this.ui.infoPanel.style.display = 'block';
        this.ui.msgBox.style.display = 'none';
        if (this.currentLevel === 1) this.setupLevel1();
        if (this.currentLevel === 2) this.setupLevel2();
        if (this.currentLevel === 3) this.setupLevel3();
        if (this.currentLevel === 4) this.setupLevel4();
        if (this.currentLevel === 5) this.setupLevel5();
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
        this.updateUi("Simple Maneuver", "Align and park the truck in the space.");

        this.scenario.resetParkingZone(3.5, 8.5, 0, 0);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 3, -10, 0);
        this.trunk_trailer.Reset(-7, 3, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetLeftView();

        this.checkSuccessFunction = this.simpleParking;
    }

    setupLevel2() {
        this.updateUi("90 Degree Maneuver", "Align and park the truck in the space.");

        this.keyboardController.lockParkingBreak();
        this.truck.reset(20, 3, -20, -Math.PI / 2);
        this.trunk_trailer.Reset(-7, 3, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.Reset();

        this.checkSuccessFunction = this.simpleParking;
    }

    setupLevel3() {
        this.updateUi("Reverse parking", "Align and reverse park the truck.");

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 3, -10, 0);
        this.trunk_trailer.Reset(-7, 3, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetLeftView();

        this.checkSuccessFunction = () => {
            const chassisBody = this.truck.vehicle.chassisBody;
            const pos = chassisBody.position;
            const quat = chassisBody.quaternion;
            const speed = chassisBody.velocity.length();
            const angleY = 2 * Math.atan2(quat.y, quat.w);
            const isInParkingZone = Math.abs(pos.x) < 0.5 && Math.abs(pos.z) < 0.5;
            if (isInParkingZone) {
                if (speed < 0.1 && Math.abs(angleY) > 3.10 && Math.abs(angleY) < 3.18) {
                    this.passedLevel("You parked successfuly!");
                }
            }
        }
    }

    setupLevel4() {
        this.updateUi("Trailer Abilities", "Hitch the trailer and park it on the indicated area");

        const parkX = 12;
        const parkZ = 9;
        this.scenario.resetParkingZone(16, 4, parkX, parkZ);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 3, -10, 0);
        this.trunk_trailer.Reset(-7, 3, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetLeftView();

        this.checkSuccessFunction = () => {
            const chassisBody = this.trunk_trailer.vehicle.chassisBody;
            const pos = chassisBody.position;
            const quat = chassisBody.quaternion;
            const speed = chassisBody.velocity.length();
            const angleY = 2 * Math.atan2(quat.y, quat.w);
            const isInParkingZone = Math.abs(pos.x - parkX) < 0.5 && Math.abs(pos.z - parkZ) < 0.5;
            if (isInParkingZone && speed < 0.1) {
                this.passedLevel("You parked successfuly!");
            }
        }
    }

    setupLevel5() {
        this.updateUi("Advanced Trailer Abilities", "Hitch the trailer and reverse park it on the indicated area");

        const parkX = -11.5;
        const parkZ = 9.5;
        this.scenario.resetParkingZone(16, 4, parkX, parkZ);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 3, -10, 0);
        this.trunk_trailer.Reset(20, 3, 9, -Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetRightView();

        this.checkSuccessFunction = () => {
            const chassisBody = this.trunk_trailer.vehicle.chassisBody;
            const pos = chassisBody.position;
            const quat = chassisBody.quaternion;
            const speed = chassisBody.velocity.length();
            const angleY = 2 * Math.atan2(quat.y, quat.w);
            const isInParkingZone = Math.abs(pos.x - parkX) < 0.5 && Math.abs(pos.z - parkZ) < 0.5;
            if (isInParkingZone) {
                if (speed < 0.1 && Math.abs(angleY) > 4.65 && Math.abs(angleY) < 4.78) {
                    this.passedLevel("You are the King of the Road!\nPlay again?");
                }
            }
        }
    }

    updateUi(infoTitle, infoDescription) {
        this.ui.infoTitle.innerText = "Level " + this.currentLevel + ": " + infoTitle;
        this.ui.infoDescription.innerText = infoDescription;
        this.ui.attemptyCounter.innerText = "Attempty: " + this.attempty;
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
        this.ui.msgBox.style.display = 'block';
    }

    failedLevel(reason) {
        this.gameEnded = true;
        this.attempty++;
        this.truck.freeze();
        this.ui.msgText.innerText = 'Level failed!\n' + reason;
        this.ui.msgBox.className = 'message-box fail';
        this.ui.msgBox.style.display = 'block';
        this.ui.actionButton.innerText = "Try again";
        this.ui.actionButton.onclick = () => this.setupLevel();
    }
}
