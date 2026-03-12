import { AudioEngine } from './audio/AudioEngine';
import { PeakCache } from './waveform/PeakCache';
import { WaveformRenderer } from './waveform/WaveformRenderer';
import { WaveformView } from './waveform/WaveformView';
import { TimeRuler } from './waveform/TimeRuler';
import { Selection } from './editor/Selection';
import { EditHistory } from './editor/EditHistory';
import { DeleteRegionCommand } from './editor/Commands';
import { Toolbar } from './ui/Toolbar';
import { StatusBar } from './ui/StatusBar';

// ── Core State ──────────────────────────────────────────
const engine = new AudioEngine();
const peakCache = new PeakCache();
const view = new WaveformView();
const selection = new Selection();
const history = new EditHistory();

// ── DOM ─────────────────────────────────────────────────
const waveformCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const rulerCanvas = document.getElementById('ruler-canvas') as HTMLCanvasElement;
const waveformContainer = document.getElementById('waveform-container') as HTMLDivElement;
const scrollbarContainer = document.getElementById('scrollbar-container') as HTMLDivElement;
const scrollbarThumb = document.getElementById('scrollbar-thumb') as HTMLDivElement;
const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;

// ── Renderers ───────────────────────────────────────────
const renderer = new WaveformRenderer(waveformCanvas);
const ruler = new TimeRuler(rulerCanvas);
const toolbar = new Toolbar();
const statusBar = new StatusBar();

// ── State ───────────────────────────────────────────────
let currentFileName = '';
let animFrameId = 0;
let isDraggingSelection = false;
let isDraggingScrollbar = false;
let scrollbarDragStartX = 0;
let scrollbarDragStartOffset = 0;

// ── Render Loop ─────────────────────────────────────────
function render(): void {
  const cursorSample = engine.currentSample;
  const sel = selection.hasSelection
    ? { startSample: selection.normalized.start, endSample: selection.normalized.end }
    : null;

  view.canvasWidth = renderer.width;
  renderer.render(peakCache, view, sel, cursorSample);
  ruler.render(view);
  updateScrollbar();
  updateStatusBar(cursorSample);
}

function startPlaybackLoop(): void {
  cancelAnimationFrame(animFrameId);
  const loop = () => {
    if (engine.state !== 'playing') {
      animFrameId = 0;
      render();
      return;
    }
    // Auto-scroll to follow cursor
    view.ensureVisible(engine.currentSample, 0.15);
    render();
    animFrameId = requestAnimationFrame(loop);
  };
  animFrameId = requestAnimationFrame(loop);
}

function stopPlaybackLoop(): void {
  cancelAnimationFrame(animFrameId);
  animFrameId = 0;
  render();
}

// ── File Loading ────────────────────────────────────────
async function openFile(): Promise<void> {
  try {
    // Use Tauri dialog if available, otherwise fallback to input element
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Audio Files',
        extensions: ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a', 'webm', 'wma'],
      }],
    });
    if (!selected) return;

    const filePath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const bytes = await readFile(filePath);
    currentFileName = filePath.split(/[/\\]/).pop() || 'audio';
    // bytes may be a view into a larger buffer; slice to get exact range
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await loadAudioData(arrayBuffer);
  } catch {
    // Fallback: use HTML file input
    openFileFallback();
  }
}

function openFileFallback(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    currentFileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    await loadAudioData(arrayBuffer);
  };
  input.click();
}

async function loadAudioData(arrayBuffer: ArrayBuffer): Promise<void> {
  const bufferData = await engine.loadArrayBuffer(arrayBuffer);

  // Set up view
  view.totalSamples = bufferData.length;
  view.setSampleRate(bufferData.sampleRate);
  view.canvasWidth = renderer.width;
  view.fitToWidth();

  // Compute peaks
  peakCache.buildFromChannels(bufferData.channels);

  // Reset editor state
  selection.clear();
  history.clear();

  // Update UI
  toolbar.setFileLoaded(true);
  toolbar.setUndoRedo(false, false);
  toolbar.setDeleteEnabled(false);
  statusBar.setFileInfo(
    currentFileName,
    bufferData.duration,
    bufferData.sampleRate,
    bufferData.numberOfChannels
  );

  render();
}

// ── Playback ────────────────────────────────────────────
engine.onStateChange = (state) => {
  toolbar.setPlaying(state === 'playing');
  if (state === 'playing') {
    startPlaybackLoop();
  } else {
    stopPlaybackLoop();
  }
};

// ── Editing ─────────────────────────────────────────────
function afterEdit(): void {
  if (!engine.bufferData) return;
  view.totalSamples = engine.bufferData.length;
  selection.clear();
  engine.invalidateCachedBuffer();
  updateEditButtons();
  statusBar.setFileInfo(
    currentFileName,
    engine.bufferData.duration,
    engine.bufferData.sampleRate,
    engine.bufferData.numberOfChannels
  );
  render();
}

function deleteSelection(): void {
  if (!engine.bufferData || !selection.hasSelection) return;

  const wasPlaying = engine.state === 'playing';
  if (wasPlaying) engine.pause();

  const { start, end } = selection.normalized;
  const cmd = new DeleteRegionCommand(engine.bufferData, peakCache, start, end);
  history.execute(cmd);

  engine.seekTo(Math.min(start, engine.bufferData.length));
  afterEdit();
}

function undo(): void {
  if (!history.canUndo || !engine.bufferData) return;
  const wasPlaying = engine.state === 'playing';
  if (wasPlaying) engine.pause();

  history.undo();
  afterEdit();
}

function redo(): void {
  if (!history.canRedo || !engine.bufferData) return;
  const wasPlaying = engine.state === 'playing';
  if (wasPlaying) engine.pause();

  history.redo();
  afterEdit();
}

function updateEditButtons(): void {
  toolbar.setUndoRedo(history.canUndo, history.canRedo);
  toolbar.setDeleteEnabled(selection.hasSelection);
}

// ── Export ───────────────────────────────────────────────
async function exportAudio(): Promise<void> {
  if (!engine.bufferData) return;

  try {
    statusBar.showMessage('Encoding...');

    const baseName = currentFileName.replace(/\.[^.]+$/, '') + '_edited';

    const { encodeMp3 } = await import('./audio/Mp3Encoder');
    const blob = await encodeMp3(engine.bufferData);
    const arrayBuf = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      let path = await save({
        filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }],
        defaultPath: baseName + '.mp3',
      });
      if (!path) {
        statusBar.showMessage('Export cancelled.');
        return;
      }
      if (!path.toLowerCase().endsWith('.mp3')) path += '.mp3';
      await writeFile(path, bytes);
      statusBar.showMessage('Export complete!');
    } catch (tauriErr) {
      console.warn('Tauri save not available, using browser download:', tauriErr);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = baseName + '.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      statusBar.showMessage('Export complete!');
    }
  } catch (err) {
    console.error('Export failed:', err);
    statusBar.showMessage('Export failed: ' + (err instanceof Error ? err.message : String(err)));
  }
}

// ── Toolbar Events ──────────────────────────────────────
toolbar.onOpen = openFile;
toolbar.onPlay = () => engine.togglePlayPause();
toolbar.onStop = () => engine.stop();
toolbar.onZoomIn = () => { view.zoomAt(view.canvasWidth / 2, 2); render(); };
toolbar.onZoomOut = () => { view.zoomAt(view.canvasWidth / 2, 0.5); render(); };
toolbar.onZoomFit = () => { view.fitToWidth(); render(); };
toolbar.onUndo = undo;
toolbar.onRedo = redo;
toolbar.onDelete = deleteSelection;
toolbar.onExport = exportAudio;
toolbar.onSpeedChange = (speed) => { engine.playbackRate = speed; };

// ── Mouse Events (Waveform) ────────────────────────────
waveformCanvas.addEventListener('mousedown', (e) => {
  if (!engine.bufferData) return;
  if (e.button === 0) {
    // Left click: start selection
    isDraggingSelection = true;
    const rect = waveformCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const sample = Math.max(0, Math.min(view.totalSamples, Math.round(view.pixelToSample(px))));
    selection.set(sample, sample);
    updateEditButtons();
    render();
  }
});

window.addEventListener('mousemove', (e) => {
  if (isDraggingSelection && engine.bufferData) {
    const rect = waveformCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const sample = Math.max(0, Math.min(view.totalSamples, Math.round(view.pixelToSample(px))));
    selection.endSample = sample;
    updateEditButtons();
    render();
  }
  if (isDraggingScrollbar) {
    const containerRect = scrollbarContainer.getBoundingClientRect();
    const dx = e.clientX - scrollbarDragStartX;
    const fraction = dx / containerRect.width;
    view.scrollOffset = scrollbarDragStartOffset + fraction * view.totalSamples;
    view.clampScroll();
    render();
  }
});

window.addEventListener('mouseup', (_e) => {
  if (isDraggingSelection) {
    isDraggingSelection = false;
    // If click without drag, seek to that position (use stored start position)
    if (!selection.hasSelection && engine.bufferData) {
      engine.seekTo(selection.startSample);
    }
    render();
  }
  isDraggingScrollbar = false;
});

// ── Mouse Wheel (Zoom + Scroll) ────────────────────────
waveformContainer.addEventListener('wheel', (e) => {
  if (!engine.bufferData) return;
  e.preventDefault();

  const rect = waveformCanvas.getBoundingClientRect();
  const px = e.clientX - rect.left;

  if (e.shiftKey || e.deltaX !== 0) {
    // Horizontal scroll
    const delta = e.shiftKey ? e.deltaY : e.deltaX;
    view.scrollByPixels(delta);
  } else {
    // Zoom
    const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
    view.zoomAt(px, factor);
  }
  render();
}, { passive: false });

// ── Scrollbar ───────────────────────────────────────────
function updateScrollbar(): void {
  const { thumbPos, thumbSize } = view.getScrollbarState();
  scrollbarThumb.style.left = `${thumbPos * 100}%`;
  scrollbarThumb.style.width = `${thumbSize * 100}%`;
}

scrollbarThumb.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isDraggingScrollbar = true;
  scrollbarDragStartX = e.clientX;
  scrollbarDragStartOffset = view.scrollOffset;
});

scrollbarContainer.addEventListener('mousedown', (e) => {
  if (e.target === scrollbarThumb) return;
  // Click on track: jump to position
  const rect = scrollbarContainer.getBoundingClientRect();
  const fraction = (e.clientX - rect.left) / rect.width;
  view.scrollOffset = fraction * view.totalSamples - view.visibleSamples / 2;
  view.clampScroll();
  render();
});

// ── Keyboard Shortcuts ──────────────────────────────────
window.addEventListener('keydown', (e) => {
  // Don't handle keys if focus is on an input/select
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

  if (e.key === ' ') {
    e.preventDefault();
    engine.togglePlayPause();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelection();
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
             (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
    e.preventDefault();
    redo();
  } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (engine.bufferData) {
      selection.selectAll(view.totalSamples);
      updateEditButtons();
      render();
    }
  } else if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openFile();
  } else if (e.key === 'Home') {
    e.preventDefault();
    view.scrollOffset = 0;
    engine.seekTo(0);
    render();
  } else if (e.key === 'End') {
    e.preventDefault();
    if (engine.bufferData) {
      view.scrollOffset = view.maxScroll;
      engine.seekTo(engine.bufferData.length);
      render();
    }
  } else if (e.key === '+' || e.key === '=') {
    view.zoomAt(view.canvasWidth / 2, 2);
    render();
  } else if (e.key === '-') {
    view.zoomAt(view.canvasWidth / 2, 0.5);
    render();
  }
});

// ── Disable Context Menu ────────────────────────────
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Drag and Drop ───────────────────────────────────────
let dropCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropCounter++;
  dropOverlay.classList.add('active');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropCounter--;
  if (dropCounter <= 0) {
    dropCounter = 0;
    dropOverlay.classList.remove('active');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropCounter = 0;
  dropOverlay.classList.remove('active');

  const file = e.dataTransfer?.files[0];
  if (!file) return;
  if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|aac|m4a|webm|wma)$/i)) return;

  currentFileName = file.name;
  const arrayBuffer = await file.arrayBuffer();
  await loadAudioData(arrayBuffer);
});

// ── Window Resize ───────────────────────────────────────
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    view.canvasWidth = renderer.width;
    render();
  }, 50);
});

// ── Status Bar Updates ──────────────────────────────────
function updateStatusBar(cursorSample: number): void {
  if (!engine.bufferData) return;

  const sr = engine.sampleRate;
  statusBar.setPosition(cursorSample / sr);

  if (selection.hasSelection) {
    const { start, end } = selection.normalized;
    statusBar.setSelection(start / sr, end / sr);
  } else {
    statusBar.setSelection(null, null);
  }
}

// ── Initial Render ──────────────────────────────────────
render();
