export class Stopwatch {
    constructor(element) {
        this.element = element;
        this.elapsedTime = 0;
        this.startTime = null;
        this.intervalId = null;
    }

    _formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    _update() {
        this.elapsedTime += Date.now() - this.startTime;
        this.startTime = Date.now();
        if (this.element) {
            this.element.innerText = this._formatTime(this.elapsedTime);
        }
    }

    Reset() {
        clearInterval(this.intervalId);
        this.elapsedTime = 0;
    }

    Start() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.startTime = Date.now();
        this.intervalId = setInterval(() => this._update(), 50);
    }

    Pause() {
        clearInterval(this.intervalId);
    }

    getFormattedElapsedTime() {
        return this._formatTime(this.elapsedTime);
    }
}
