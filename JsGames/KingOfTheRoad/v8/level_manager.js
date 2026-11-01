import { TRAILER_REST_Y } from './trunk_trailer.js';

export class LevelManager {
    constructor(uiElements, camera, truck, trunk_trailer, keyboardController, scenario, stopwatch) {
        this.gameEnded = false;
        this.numLevels = 6;
        this.currentLevel = 1;
        this.ui = uiElements;
        this.camera = camera;
        this.truck = truck;
        this.trunk_trailer = trunk_trailer;
        this.keyboardController = keyboardController;
        this.scenario = scenario;
        this.stopwatch = stopwatch;
        this.checkSuccessFunction = null;
        this.attempt = 1;
        this._localFwd = new CANNON.Vec3(0, 0, 1);
        this._worldFwd = new CANNON.Vec3();
    }

    Ended() {
        return this.gameEnded;
    }

    setupLevel() {
        if (this.currentLevel > this.numLevels) {
            return false;
        }
        if (this.currentLevel === 1) {
             this.stopwatch.Reset();
        }
        this.gameEnded = false;
        this.ui.msgBox.style.display = 'none';
        this.stopwatch.Start();
        if (this.currentLevel === 1) this.setupLevel1();
        if (this.currentLevel === 2) this.setupLevel2();
        if (this.currentLevel === 3) this.setupLevel3();
        if (this.currentLevel === 4) this.setupLevel4();
        if (this.currentLevel === 5) this.setupLevel5();
        if (this.currentLevel === 6) this.setupLevel6();
        return true;
    }

    checkSuccess() {
        return this.checkSuccessFunction();
    }

    _getBodyHeading(body) {
        body.vectorToWorldFrame(this._localFwd, this._worldFwd);
        return Math.atan2(this._worldFwd.x, this._worldFwd.z);
    }

    _angleDiff(a, b) {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d);
    }

    _isBodyParked(body, targetX, targetZ, targetHeading, tolX, tolZ, tolAngle) {
        const pos = body.position;
        if (Math.abs(pos.x - targetX) >= tolX || Math.abs(pos.z - targetZ) >= tolZ) {
            return false;
        }
        if (body.velocity.length() >= 0.1) {
            return false;
        }
        const heading = this._getBodyHeading(body);
        return this._angleDiff(heading, targetHeading) < tolAngle;
    }

    _evaluateCompletion(isParked, successMessage) {
        if (!isParked) {
            this.truck.invalidateNotifications('park-finish-hint');
            return;
        }

        const brakeLocked = Boolean(this.truck.parkingBrakeOn);
        const engineOff = !this.truck.isEngineOn();

        if (brakeLocked && engineOff) {
            this.passedLevel(successMessage);
            return;
        }

        if (!brakeLocked && !engineOff) {
            this.truck.showinfo("🅿 Lock parking brake & turn off engine to finish", { group: 'park-finish-hint' });
        } else if (!brakeLocked) {
            this.truck.showinfo("🅿 Lock the parking brake to finish", { group: 'park-finish-hint' });
        } else {
            this.truck.showinfo("🔌 Turn off the engine to finish", { group: 'park-finish-hint' });
        }
    }

    simpleParking() {
        const chassisBody = this.truck.vehicle.chassisBody;
        const parked = this._isBodyParked(chassisBody, 0, 0, 0, 0.5, 0.5, 0.2);
        this._evaluateCompletion(parked, "You parked successfuly!");
    }

    setupLevel1() {
        this.updateUi("Simple Maneuver", "Align and park the truck, lock brake and turn off engine.");

        this.scenario.resetParkingZone(3.5, 8.5, 0, 0);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 2, -10, 0);
        this.trunk_trailer.Reset(-7, TRAILER_REST_Y, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetLeftView();

        this.checkSuccessFunction = () => this.simpleParking();
    }

    setupLevel2() {
        this.updateUi("90 Degree Maneuver", "Align and park the truck, lock brake and turn off engine.");

        this.scenario.resetParkingZone(3.5, 8.5, 0, 0);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(20, 0.85, -20, -Math.PI / 2);
        this.trunk_trailer.Reset(-7, TRAILER_REST_Y, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.Reset();

        this.checkSuccessFunction = () => this.simpleParking();
    }

    setupLevel3() {
        this.updateUi("Reverse parking", "Reverse park the truck, lock brake and turn off engine.");

        this.scenario.resetParkingZone(3.5, 8.5, 0, 0);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(20, 0.85, -20, -Math.PI / 2);
        this.trunk_trailer.Reset(-7, TRAILER_REST_Y, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetLeftView();

        this.checkSuccessFunction = () => {
            const chassisBody = this.truck.vehicle.chassisBody;
            const parked = this._isBodyParked(chassisBody, 0, 0, Math.PI, 0.5, 0.5, 0.05);
            this._evaluateCompletion(parked, "You parked successfuly!");
        };
    }

    setupLevel4() {
        this.updateUi("Trailer Abilities", "Hitch and park the trailer on the indicated area, lock brake & turn off engine.");

        const parkX = 12;
        const parkZ = 9;
        this.scenario.resetParkingZone(16, 4, parkX, parkZ);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 0.85, -10, 0);
        this.trunk_trailer.Reset(-7, TRAILER_REST_Y, 9, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetLeftView();

        this.checkSuccessFunction = () => {
            const trailerBody = this.trunk_trailer.vehicle.chassisBody;
            const pos = trailerBody.position;
            const parked =
                Math.abs(pos.x - parkX) < 0.5 &&
                Math.abs(pos.z - parkZ) < 0.5 &&
                trailerBody.velocity.length() < 0.1;
            this._evaluateCompletion(parked, "You parked successfuly!");
        };
    }

    setupLevel5() {
        this.updateUi("Advanced Trailer Abilities", "Hitch and park the trailer on the left, lock brake & turn off engine.");

        const parkX = 15;
        const parkZ = -18;
        this.scenario.resetParkingZone(4, 16, parkX, parkZ);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 0.85, 12, Math.PI / 2);
        this.trunk_trailer.Reset(-12, TRAILER_REST_Y, 12, Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetRightView();

        this.checkSuccessFunction = () => {
            const trailerBody = this.trunk_trailer.vehicle.chassisBody;
            const parked = this._isBodyParked(trailerBody, parkX, parkZ, Math.PI, 0.5, 0.5, 0.06);
            this._evaluateCompletion(
                parked,
                "You parked successfuly, you're becoming a rock star!"
            );
        };
    }

    setupLevel6() {
        this.updateUi("Advanced Trailer Abilities", "Hitch and reverse park the trailer, lock brake & turn off engine.");

        const parkX = -12;
        const parkZ = 9.5;
        this.scenario.resetParkingZone(15, 4, parkX, parkZ);
        this.scenario.addConeCollisions(this.truck.vehicle, this);
        this.scenario.addConeCollisions(this.trunk_trailer.vehicle, this);

        this.keyboardController.lockParkingBreak();
        this.truck.reset(0, 0.85, -10, 0);
        this.trunk_trailer.Reset(20, TRAILER_REST_Y, 9, -Math.PI / 2);
        this.camera.SwitchTo("orbital");
        this.camera.GetObject().ResetRightView();

        this.checkSuccessFunction = () => {
            const trailerBody = this.trunk_trailer.vehicle.chassisBody;
            const parked = this._isBodyParked(trailerBody, parkX, parkZ, Math.PI / 2, 0.5, 0.5, 0.07);
            this._evaluateCompletion(
                parked,
                "🎉🎉🎉\nYou are the\nKing of The Road!\n👑👑👑"
            );
        };
    }

    updateUi(infoTitle, infoDescription) {
        if (this.ui.topInfoPanel) {
            this.ui.topInfoPanel.style.display = '';
        }
        const fullTitle = "Level " + this.currentLevel + ": " + infoTitle;
        this.ui.infoTitle.textContent = fullTitle;
        this.ui.infoDescription.textContent = infoDescription;
        if (this.ui.helpLevelTitle) {
            this.ui.helpLevelTitle.textContent = fullTitle;
        }
        if (this.ui.helpLevelDescription) {
            this.ui.helpLevelDescription.textContent = infoDescription;
        }
        this.ui.attemptCounter.textContent = "Attempt: " + this.attempt;
    }

    passedLevel(reason) {
        if (this.gameEnded) return;
        let nextLevel = this.currentLevel + 1;
        if (nextLevel > this.numLevels) {
            nextLevel = 1;
        }
        this.gameEnded = true;
        this.truck.freeze();
        if (this.truck && this.truck.engineSound) {
            this.truck.engineSound.playSuccessSound();
        }
        this.stopwatch.Pause();
        this.ui.msgBox.className = 'message-box';
        this.ui.msgText.innerText = 'Congratulations!\n' + reason;
        const buttonText = nextLevel === 1 ? "Play Again" : "Start Level " + nextLevel;
        this.ui.actionButton.innerText = buttonText;
        this.ui.actionButton.onclick = () => {
            this.currentLevel = nextLevel;
            this.setupLevel();
        };
        this.ui.msgBox.style.display = 'block';
    }

    failedLevel(reason) {
        if (this.gameEnded) return;
        this.attempt++;
        this.gameEnded = true;
        this.truck.freeze();
        if (this.truck && this.truck.engineSound) {
            this.truck.engineSound.playFailSound();
        }
        this.stopwatch.Pause();
        this.ui.msgText.innerText = 'Level failed!\n' + reason;
        this.ui.msgBox.className = 'message-box fail';
        this.ui.msgBox.style.display = 'block';
        this.ui.actionButton.innerText = "Try again";
        this.ui.actionButton.onclick = () => this.setupLevel();
    }
}
