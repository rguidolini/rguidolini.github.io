export class KeyboardController {
    Initialize() {
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        this.brakeDirection = 0;
    }


    HandleKeyDown(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = true;
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
    getSteering() {
        if (this.keys.ArrowLeft) return -1;
        if (this.keys.ArrowRight) return 1;
        return 0;
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
}