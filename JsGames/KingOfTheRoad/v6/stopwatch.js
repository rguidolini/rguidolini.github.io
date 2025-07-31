export class Stopwatch {
    constructor(element) {
        this.element = element;
        this.startTime = Date.now();
        this.elapsedTime = 0;
        this.intervalId = null;
    }

    _formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    Update() {
        this.elapsedTime = Date.now() - this.startTime;
        this.element.innerText = this._formatTime(this.elapsedTime);
    }
}

