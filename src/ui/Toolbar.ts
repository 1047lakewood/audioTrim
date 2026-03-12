/**
 * Toolbar button state management.
 */
export class Toolbar {
  private btnOpen: HTMLButtonElement;
  private btnPlay: HTMLButtonElement;
  private btnStop: HTMLButtonElement;
  private btnZoomIn: HTMLButtonElement;
  private btnZoomOut: HTMLButtonElement;
  private btnZoomFit: HTMLButtonElement;
  private btnUndo: HTMLButtonElement;
  private btnRedo: HTMLButtonElement;
  private btnDelete: HTMLButtonElement;
  private btnExport: HTMLButtonElement;
  private speedSelect: HTMLSelectElement;
  onOpen: (() => void) | null = null;
  onPlay: (() => void) | null = null;
  onStop: (() => void) | null = null;
  onZoomIn: (() => void) | null = null;
  onZoomOut: (() => void) | null = null;
  onZoomFit: (() => void) | null = null;
  onUndo: (() => void) | null = null;
  onRedo: (() => void) | null = null;
  onDelete: (() => void) | null = null;
  onExport: (() => void) | null = null;
  onSpeedChange: ((speed: number) => void) | null = null;

  constructor() {
    this.btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
    this.btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
    this.btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    this.btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
    this.btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement;
    this.btnZoomFit = document.getElementById('btn-zoom-fit') as HTMLButtonElement;
    this.btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
    this.btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
    this.btnDelete = document.getElementById('btn-delete') as HTMLButtonElement;
    this.btnExport = document.getElementById('btn-export') as HTMLButtonElement;
    this.speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
    this.btnOpen.addEventListener('click', () => this.onOpen?.());
    this.btnPlay.addEventListener('click', () => this.onPlay?.());
    this.btnStop.addEventListener('click', () => this.onStop?.());
    this.btnZoomIn.addEventListener('click', () => this.onZoomIn?.());
    this.btnZoomOut.addEventListener('click', () => this.onZoomOut?.());
    this.btnZoomFit.addEventListener('click', () => this.onZoomFit?.());
    this.btnUndo.addEventListener('click', () => this.onUndo?.());
    this.btnRedo.addEventListener('click', () => this.onRedo?.());
    this.btnDelete.addEventListener('click', () => this.onDelete?.());
    this.btnExport.addEventListener('click', () => this.onExport?.());
    this.speedSelect.addEventListener('change', () => {
      this.onSpeedChange?.(parseFloat(this.speedSelect.value));
    });
  }

  setFileLoaded(loaded: boolean): void {
    const btns = [
      this.btnPlay, this.btnStop, this.btnZoomIn, this.btnZoomOut,
      this.btnZoomFit, this.btnExport,
    ];
    btns.forEach(b => b.disabled = !loaded);
    this.speedSelect.disabled = !loaded;
  }

  setPlaying(playing: boolean): void {
    this.btnPlay.textContent = playing ? 'Pause' : 'Play';
  }

  setUndoRedo(canUndo: boolean, canRedo: boolean): void {
    this.btnUndo.disabled = !canUndo;
    this.btnRedo.disabled = !canRedo;
  }

  setDeleteEnabled(enabled: boolean): void {
    this.btnDelete.disabled = !enabled;
  }
}
