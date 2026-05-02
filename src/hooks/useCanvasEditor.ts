import { useState, useCallback, useRef } from 'react';
import { CanvasEditState, DEFAULT_EDIT_STATE } from '../utils/canvasFilters';

export type DrawingTool = 'none' | 'pen' | 'eraser' | 'line' | 'arrow' | 'text' | 'rect' | 'circle';

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  brushSize: number;
  fillShape: boolean;
  cornerRadius: number;
  opacity: number;
}

export interface TextState {
  active: boolean;
  x: number;
  y: number;
  text: string;
  font: 'sans' | 'serif' | 'mono';
  size: number;
  color: string;
}

export interface CropState {
  active: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_TEXT_STATE: TextState = {
  active: false,
  x: 0,
  y: 0,
  text: '',
  font: 'sans',
  size: 32,
  color: '#ffffff',
};

const FONT_FAMILIES: Record<TextState['font'], string> = {
  sans: "'Segoe UI', Arial, sans-serif",
  serif: 'Georgia, Times, serif',
  mono: "Consolas, 'Courier New', monospace",
};

export function useCanvasEditor(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const [editState, setEditState] = useState<CanvasEditState>(DEFAULT_EDIT_STATE);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('none');
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    color: '#ffffff',
    brushSize: 3,
    fillShape: false,
    cornerRadius: 0,
    opacity: 1,
  });
  const [textState, setTextState] = useState<TextState>(DEFAULT_TEXT_STATE);
  const [cropState, setCropState] = useState<CropState>({ active: false, x: 0, y: 0, w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);

  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  // Snapshot before current shape drag (for live preview)
  const shapeSnapshotRef = useRef<ImageData | null>(null);

  const saveToUndoStack = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    undoStackRef.current.push(imageData);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, [canvasRef]);

  const undo = useCallback(() => {
    if (!canvasRef.current || undoStackRef.current.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    redoStackRef.current.push(current);
    const prev = undoStackRef.current.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
  }, [canvasRef]);

  const redo = useCallback(() => {
    if (!canvasRef.current || redoStackRef.current.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    undoStackRef.current.push(current);
    const next = redoStackRef.current.pop();
    if (next) ctx.putImageData(next, 0, 0);
  }, [canvasRef]);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool === 'none') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scaleX = (canvasRef.current?.width ?? 1) / rect.width;
    const scaleY = (canvasRef.current?.height ?? 1) / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'text') {
      setTextState(prev => ({ ...prev, active: true, x, y, text: '' }));
      return;
    }

    saveToUndoStack();

    // Snapshot canvas for live shape preview
    if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'arrow') {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        shapeSnapshotRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    setDrawingState(prev => ({
      ...prev,
      isDrawing: true,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
    }));
  }, [currentTool, canvasRef, saveToUndoStack]);

  const continueDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingState.isDrawing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    setDrawingState(prev => ({ ...prev, endX: x, endY: y }));

    if (currentTool === 'pen') {
      ctx.strokeStyle = drawingState.color;
      ctx.lineWidth = drawingState.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = drawingState.opacity;
      ctx.beginPath();
      ctx.moveTo(drawingState.endX, drawingState.endY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (currentTool === 'eraser') {
      ctx.clearRect(
        x - drawingState.brushSize / 2,
        y - drawingState.brushSize / 2,
        drawingState.brushSize,
        drawingState.brushSize
      );
    } else if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'arrow') {
      // Restore snapshot for live preview
      if (shapeSnapshotRef.current) {
        ctx.putImageData(shapeSnapshotRef.current, 0, 0);
      }
      drawShape(ctx, currentTool, drawingState.startX, drawingState.startY, x, y, drawingState);
    }
  }, [drawingState, currentTool, canvasRef]);

  const stopDrawing = useCallback(() => {
    if (!drawingState.isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (currentTool === 'line' || currentTool === 'arrow') {
      if (shapeSnapshotRef.current) ctx.putImageData(shapeSnapshotRef.current, 0, 0);
      drawShape(ctx, currentTool, drawingState.startX, drawingState.startY, drawingState.endX, drawingState.endY, drawingState);
    } else if (currentTool === 'rect' || currentTool === 'circle') {
      if (shapeSnapshotRef.current) ctx.putImageData(shapeSnapshotRef.current, 0, 0);
      drawShape(ctx, currentTool, drawingState.startX, drawingState.startY, drawingState.endX, drawingState.endY, drawingState);
    }

    shapeSnapshotRef.current = null;
    setDrawingState(prev => ({ ...prev, isDrawing: false }));
  }, [drawingState, currentTool, canvasRef]);

  // Commit text to canvas
  const commitText = useCallback(() => {
    if (!canvasRef.current || !textState.text.trim()) {
      setTextState(DEFAULT_TEXT_STATE);
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    saveToUndoStack();
    ctx.font = `${textState.size}px ${FONT_FAMILIES[textState.font]}`;
    ctx.fillStyle = textState.color;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(textState.text, textState.x, textState.y);
    ctx.shadowBlur = 0;
    setTextState(DEFAULT_TEXT_STATE);
  }, [canvasRef, textState, saveToUndoStack]);

  const clear = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    saveToUndoStack();
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [canvasRef, saveToUndoStack]);

  return {
    editState,
    setEditState,
    currentTool,
    setCurrentTool,
    drawingState,
    setDrawingState,
    textState,
    setTextState,
    commitText,
    cropState,
    setCropState,
    rotation,
    setRotation,
    startDrawing,
    continueDrawing,
    stopDrawing,
    undo,
    redo,
    clear,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: DrawingTool,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  state: DrawingState
) {
  ctx.strokeStyle = state.color;
  ctx.fillStyle = state.color;
  ctx.lineWidth = state.brushSize;
  ctx.globalAlpha = state.opacity;

  if (tool === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (tool === 'arrow') {
    drawArrow(ctx, x1, y1, x2, y2, state.color, state.brushSize);
  } else if (tool === 'rect') {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    const r = state.cornerRadius;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
    if (state.fillShape) ctx.fill();
    else ctx.stroke();
  } else if (tool === 'circle') {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
    if (state.fillShape) ctx.fill();
    else ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number, toX: number, toY: number,
  color: string, size: number
) {
  const headlen = Math.max(15, size * 4);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}
