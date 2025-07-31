export class KeyboardController {
    constructor() {
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        this.brakeDirection = 0;
        this.parkingBrakeOn = false;
        this.currentSteerValue = 0;
    }

    HandleKeyDown(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = true;
        }
        if (e.key === " ") {
            e.preventDefault(); // Evita que a página role
            this.switchParkingBreak();
        }
    }

    HandleKeyUp(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = false;
        }
        if (e.key == "ArrowUp" || e.key == "ArrowDown") {
            this.brakeDirection = 0;
        }
    }

    /**
     * Controls steering wheel based on keyboard input.
     * Returns a percentage of the steering wheel to be turned. -1 for left, 1 for right.
     */
    getSteering(deltaTime) {
        // --- LÓGICA DE DIREÇÃO GRADUAL BASEADA NO TEMPO ---
        const maxSteerVal = 1;
        const steerTime = 1; // Tempo em segundos para atingir o ângulo máximo
        const returnTime = steerTime / 2.0; // Tempo de retorno (o dobro da velocidade)
        const steerSpeed = maxSteerVal / steerTime;
        const returnSpeed = maxSteerVal / returnTime;

        if (this.keys.ArrowRight) {
            this.currentSteerValue += steerSpeed * deltaTime;
            if (this.currentSteerValue > maxSteerVal) this.currentSteerValue = maxSteerVal;
        } else if (this.keys.ArrowLeft) {
            this.currentSteerValue -= steerSpeed * deltaTime;
            if (this.currentSteerValue < -maxSteerVal) this.currentSteerValue = -maxSteerVal;
        } else {
            if (this.currentSteerValue > 0) {
                this.currentSteerValue -= returnSpeed * deltaTime;
                if (this.currentSteerValue < 0) this.currentSteerValue = 0;
            } else if (this.currentSteerValue < 0) {
                this.currentSteerValue += returnSpeed * deltaTime;
                if (this.currentSteerValue > 0) this.currentSteerValue = 0;
            }
        }
        return this.currentSteerValue;
    }

    /**
     * Controls the vehicle acceleration based on keyboard input.
     * @param {string} movementDirection: >0 for forward, <0 for backward.
     * Returns a percentage of the acceleration. 1 for forward, -1 for backward.
     */
    getThrottle(movementDirection) {
        if (this.brakeDirection !== 0) return 0; // No throttle if braking.


        // If vehicle is stopped and we are not braking, start throttling.
        if (movementDirection === 0) {
            if (this.keys.ArrowUp) return 1;
            if (this.keys.ArrowDown) return -1;
        }

        // If command is in the same direction as the movement direction, throttle.
        if (movementDirection > 0 && this.keys.ArrowUp) return 1;
        if (movementDirection < 0 && this.keys.ArrowDown) return -1;

        return 0;
    }

    /**
     * Controls the vehicle Braking based on keyboard input.
     * @param {string} movementDirection: >0 for forward, <0 for backward.
     * Returns a percentage of the Brakeing force. 1 for forward, -1 for backward.
     */
    getBrake(movementDirection) {
        if (this.brakeDirection !== 0) return 1; // If braking then keep braking.

        if (
            (movementDirection > 0 && this.keys.ArrowDown) ||
            (movementDirection < 0 && this.keys.ArrowUp)
        ) {
            this.brakeDirection = movementDirection;
            return 1;
        }
        return 0;
    }

    switchParkingBreak() {
        this.parkingBrakeOn = !this.parkingBrakeOn;
    }

    lockParkingBreak() {
        this.parkingBrakeOn = false;
        this.switchParkingBreak();
    }
}