import { renderComponentSymbol, ComponentSymbol } from './ComponentSymbol';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  MousePointer,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FolderOpen,
  FilePlus,
  Play,
  Settings,
  HelpCircle,
  Code2,
  Hash,
  Move,
  Check,
  Zap,
  Activity,
  Cable,
  Layers,
  X,
} from 'lucide-react';
import {
  CircuitElement,
  CircuitWire,
  ComponentType,
  CircuitPin,
} from '../types';
import { SAMPLE_CIRCUITS, SampleCircuit } from '../data/sampleCircuits';
import { buildCircuitGraph } from '../math/circuitSolver';
import { ComponentPalette } from './ComponentPalette';

interface SchematicEditorProps {
  elements: CircuitElement[];
  wires: CircuitWire[];
  onElementsChange: (elements: CircuitElement[]) => void;
  onWiresChange: (wires: CircuitWire[]) => void;
  onBeginContinuousEdit?: () => void;
  onEndContinuousEdit?: () => void;
  onSelectElement: (element: CircuitElement) => void;
  onOpenProperties: (element: CircuitElement) => void;
  onRunSimulation: () => void;
  onBuildPlot?: () => void;
  isGraphOpen?: boolean;
  isSimulating?: boolean;
  shortcutsEnabled?: boolean;
  viewRevision?: number;
  onOpenTransientSettings: () => void;
  onLoadSample: (sample: SampleCircuit) => void;
}

const GRID_SIZE = 20;

export interface Point {
  x: number;
  y: number;
}

/**
 * Упрощение точек полилинии: удаление дубликатов и схлопывание коллинеарных промежуточных точек.
 */
export function simplifyPoints(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const result: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    // Пропуск совпадающих точек
    if (Math.abs(curr.x - prev.x) < 1 && Math.abs(curr.y - prev.y) < 1) {
      continue;
    }
    // Если точка строго лежит на одной прямой между предыдущей и следующей — пропускаем промежуточную
    if (i < pts.length - 1) {
      const next = pts[i + 1];
      const isCollinearH = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
      const isCollinearV = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
      if (isCollinearH || isCollinearV) {
        continue;
      }
    }
    result.push(curr);
  }
  return result;
}

/**
 * Строго ортогональная трассировка проводов под прямыми углами с привязкой к сетке 20px.
 * Обеспечивает стабильное, аккуратное поведение проводов без самопроизвольных зигзагов
 * при перемещении компонентов и узлов схемы.
 */
export function computeOrthogonalWirePoints(
  p1: Point,
  p2: Point,
  p1PinRel?: Point,
  p2PinRel?: Point,
  p1Type?: string,
  p2Type?: string,
  trackOffset = 0
): Point[] {
  const x1 = Math.round(p1.x);
  const y1 = Math.round(p1.y);
  const x2 = Math.round(p2.x);
  const y2 = Math.round(p2.y);

  // Точки совпадают
  if (x1 === x2 && y1 === y2) {
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }

  // Строго горизонтальная линия
  if (y1 === y2) {
    if (trackOffset) {
      const direction1 = Math.sign(p1PinRel?.x || x2 - x1) || 1;
      const direction2 = Math.sign(p2PinRel?.x || x1 - x2) || -1;
      const stub1 = x1 + direction1 * GRID_SIZE;
      const stub2 = x2 + direction2 * GRID_SIZE;
      return simplifyPoints([
        { x: x1, y: y1 }, { x: stub1, y: y1 },
        { x: stub1, y: y1 + trackOffset }, { x: stub2, y: y1 + trackOffset },
        { x: stub2, y: y2 }, { x: x2, y: y2 },
      ]);
    }
    return [{ x: x1, y: y1 }, { x: x2, y: y1 }];
  }

  // Строго вертикальная линия
  if (x1 === x2) {
    if (trackOffset) {
      const direction1 = Math.sign(p1PinRel?.y || y2 - y1) || 1;
      const direction2 = Math.sign(p2PinRel?.y || y1 - y2) || -1;
      const stub1 = y1 + direction1 * GRID_SIZE;
      const stub2 = y2 + direction2 * GRID_SIZE;
      return simplifyPoints([
        { x: x1, y: y1 }, { x: x1, y: stub1 },
        { x: x1 + trackOffset, y: stub1 }, { x: x1 + trackOffset, y: stub2 },
        { x: x2, y: stub2 }, { x: x2, y: y2 },
      ]);
    }
    return [{ x: x1, y: y1 }, { x: x1, y: y2 }];
  }

  const isP1Junction = p1Type === 'JUNCTION';
  const isP2Junction = p2Type === 'JUNCTION';

  // Определение вертикальности пинов для правильного угла выхода
  const isP1Vertical = !isP1Junction && p1PinRel && Math.abs(p1PinRel.y) > Math.abs(p1PinRel.x);
  const isP2Vertical = !isP2Junction && p2PinRel && Math.abs(p2PinRel.y) > Math.abs(p2PinRel.x);

  // СЛУЧАЙ 1: Соединение с узлом (JUNCTION)
  // Узел всенаправленный, поэтому провод подходит к нему чистым L-углом (1 поворот 90°)
  if (isP1Junction && !isP2Junction) {
    if (isP2Vertical) {
      return simplifyPoints([
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
      ]);
    } else {
      return simplifyPoints([
        { x: x1, y: y1 },
        { x: x1, y: y2 },
        { x: x2, y: y2 },
      ]);
    }
  }

  if (!isP1Junction && isP2Junction) {
    if (isP1Vertical) {
      return simplifyPoints([
        { x: x1, y: y1 },
        { x: x1, y: y2 },
        { x: x2, y: y2 },
      ]);
    } else {
      return simplifyPoints([
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
      ]);
    }
  }

  if (isP1Junction && isP2Junction) {
    return simplifyPoints([
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
    ]);
  }

  // СЛУЧАЙ 2: Соединение между компонентами схемы
  if (isP1Vertical && !isP2Vertical) {
    return simplifyPoints([
      { x: x1, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 },
    ]);
  }

  if (!isP1Vertical && isP2Vertical) {
    return simplifyPoints([
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
    ]);
  }

  if (isP1Vertical && isP2Vertical) {
    const midY = Math.round(((y1 + y2) / 2) / GRID_SIZE) * GRID_SIZE + trackOffset;
    return simplifyPoints([
      { x: x1, y: y1 },
      { x: x1, y: midY },
      { x: x2, y: midY },
      { x: x2, y: y2 },
    ]);
  }

  // Оба пина горизонтальные (стандарт для большинства электронных элементов)
  const midX = Math.round(((x1 + x2) / 2) / GRID_SIZE) * GRID_SIZE + trackOffset;
  return simplifyPoints([
    { x: x1, y: y1 },
    { x: midX, y: y1 },
    { x: midX, y: y2 },
    { x: x2, y: y2 },
  ]);
}

function overlappingLength(points: Point[], occupied: Point[][]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    for (const route of occupied) {
      for (let otherIndex = 1; otherIndex < route.length; otherIndex++) {
        const c = route[otherIndex - 1];
        const d = route[otherIndex];
        if (a.y === b.y && c.y === d.y && a.y === c.y) {
          total += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
        } else if (a.x === b.x && c.x === d.x && a.x === c.x) {
          total += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
        }
      }
    }
  }
  return total;
}

export function pointsToSvgPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export function getComponentPins(el: CircuitElement): CircuitPin[] {
  if (el.type === 'JUNCTION') {
    return [{ id: '1', name: '•', x: 0, y: 0 }];
  }

  const rot = (el.rotation || 0) % 360;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));

  function transform(rx: number, ry: number): { x: number; y: number } {
    let x = rx;
    let y = ry;
    if (el.flipH) x = -x;
    if (el.flipV) y = -y;
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    };
  }

  if (el.type === 'GND') {
    const p = transform(0, -20);
    return [{ id: '1', name: 'GND', x: p.x, y: p.y }];
  }
  if (el.type === 'PORT') {
    const p = transform(-30, 0);
    return [{ id: '1', name: el.portName || el.name, x: p.x, y: p.y }];
  }
  if (el.type === 'OPAMP' || el.type === 'COMPARATOR') {
    const pNeg = transform(-35, -15);
    const pPos = transform(-35, 15);
    const pOut = transform(35, 0);
    return [
      { id: 'in_neg', name: '-', label: '-', x: pNeg.x, y: pNeg.y },
      { id: 'in_pos', name: '+', label: '+', x: pPos.x, y: pPos.y },
      { id: 'out', name: 'OUT', label: 'OUT', x: pOut.x, y: pOut.y },
    ];
  }
  if (el.type === 'SWITCH' || el.type === 'THYRISTOR') {
    const p1 = transform(-30, 0);
    const p2 = transform(30, 0);
    const pGate = transform(0, 25);
    return [
      { id: '1', name: 'A', x: p1.x, y: p1.y },
      { id: '2', name: 'K', x: p2.x, y: p2.y },
      { id: 'gate', name: 'G', label: 'G', x: pGate.x, y: pGate.y },
    ];
  }
  if (el.type === 'NOT') {
    const p1 = transform(-30, 0);
    const p2 = transform(30, 0);
    return [
      { id: '1', name: 'IN', x: p1.x, y: p1.y },
      { id: '2', name: 'OUT', x: p2.x, y: p2.y },
    ];
  }
  if (el.type === 'AND' || el.type === 'OR' || el.type === 'XOR') {
    const p1 = transform(-30, -10);
    const p2 = transform(-30, 10);
    const pOut = transform(30, 0);
    return [
      { id: '1', name: 'X1', x: p1.x, y: p1.y },
      { id: '2', name: 'X2', x: p2.x, y: p2.y },
      { id: '3', name: 'Y', x: pOut.x, y: pOut.y },
    ];
  }
  if (el.type === 'RS_FF' || el.type === 'D_FF' || el.type === 'JK_FF') {
    const p1 = transform(-30, -12);
    const p2 = transform(-30, 12);
    const p3 = transform(30, -12);
    const p4 = transform(30, 12);
    return [
      { id: '1', name: 'S', x: p1.x, y: p1.y },
      { id: '2', name: 'R', x: p2.x, y: p2.y },
      { id: '3', name: 'Q', x: p3.x, y: p3.y },
      { id: '4', name: '/Q', x: p4.x, y: p4.y },
    ];
  }
  if (el.type === 'TR3') {
    const p1 = transform(-30, -15);
    const p2 = transform(-30, 15);
    const p3 = transform(30, -15);
    const p4 = transform(30, 15);
    return [
      { id: '1', name: 'P1', x: p1.x, y: p1.y },
      { id: '2', name: 'P2', x: p2.x, y: p2.y },
      { id: '3', name: 'S1', x: p3.x, y: p3.y },
      { id: '4', name: 'S2', x: p4.x, y: p4.y },
    ];
  }
  if (el.type === 'TEXT') {
    return [];
  }

  // 2-выводные элементы (R, L, C, DIODE, V_DC, V_AC, V_PULSE, I_DC)
  const p1 = transform(-30, 0);
  const p2 = transform(30, 0);
  return [
    { id: '1', name: '1', x: p1.x, y: p1.y },
    { id: '2', name: '2', x: p2.x, y: p2.y },
  ];
}

export function SchematicEditor({
  elements,
  wires,
  onElementsChange,
  onWiresChange,
  onBeginContinuousEdit,
  onEndContinuousEdit,
  onSelectElement,
  onOpenProperties,
  onRunSimulation,
  onBuildPlot,
  isGraphOpen,
  isSimulating = false,
  shortcutsEnabled = true,
  viewRevision = 0,
  onOpenTransientSettings,
  onLoadSample,
}: SchematicEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [showNodeNumbers, setShowNodeNumbers] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 30 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Панель библиотеки элементов и активный инструмент
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<'select' | 'wire' | 'delete'>('select');
  const [hoveredPin, setHoveredPin] = useState<{
    compId: string;
    pinId: string;
    x: number;
    y: number;
    name: string;
  } | null>(null);
  const [hoveredWirePoint, setHoveredWirePoint] = useState<{
    wireId: string;
    x: number;
    y: number;
  } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number } | null>(null);

  // Режим размещения нового элемента
  const [pendingComponentType, setPendingComponentType] = useState<ComponentType | null>(null);

  // Режим рисования провода
  const [wiringFrom, setWiringFrom] = useState<{
    compId: string;
    pinId: string;
    x: number;
    y: number;
  } | null>(null);
  const wiringFromRef = useRef<typeof wiringFrom>(null);
  const [wiringCursor, setWiringCursor] = useState<{ x: number; y: number } | null>(null);
  const wirePointerDown = useRef(false);
  useEffect(() => { wiringFromRef.current = wiringFrom; }, [wiringFrom]);

  // Перетаскивание элемента
  const [draggingElemId, setDraggingElemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSelectedId(null);
    setSelectedWireId(null);
    setWiringFrom(null);
    setWiringCursor(null);
    setHoveredPin(null);
    setHoveredWirePoint(null);
    setDraggingElemId(null);
    setPendingComponentType(null);
    setActiveTool('select');
  }, [viewRevision]);
  useEffect(() => {
    const releaseDrag = () => {
      if (draggingElemId) onEndContinuousEdit?.();
      if (wirePointerDown.current) {
        wirePointerDown.current = false;
        wiringFromRef.current = null;
        setWiringFrom(null);
        setWiringCursor(null);
      }
      setDraggingElemId(null); setIsPanning(false);
    };
    window.addEventListener('mouseup', releaseDrag);
    window.addEventListener('blur', releaseDrag);
    return () => { window.removeEventListener('mouseup', releaseDrag); window.removeEventListener('blur', releaseDrag); };
  }, [draggingElemId, onEndContinuousEdit]);
  const fittedProject = useRef<number | null>(null);
  const fitToView = useCallback(() => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height || !elements.length) return;
    const minX = Math.min(...elements.map(element => element.x)) - 80;
    const maxX = Math.max(...elements.map(element => element.x)) + 80;
    const minY = Math.min(...elements.map(element => element.y)) - 80;
    const maxY = Math.max(...elements.map(element => element.y)) + 80;
    const nextZoom = Math.max(0.2, Math.min(1.5, (bounds.width - 48) / (maxX - minX), (bounds.height - 48) / (maxY - minY)));
    setZoom(nextZoom);
    setPan({ x: (bounds.width - (minX + maxX) * nextZoom) / 2, y: (bounds.height - (minY + maxY) * nextZoom) / 2 });
  }, [elements]);
  useEffect(() => {
    // Fit initial and replacement projects; dragging preserves the user's viewport.
    if (fittedProject.current === viewRevision) return;
    fittedProject.current = viewRevision;
    fitToView();
  }, [viewRevision, fitToView]);

  // Граф узлов для нумерации
  const circuitGraph = useMemo(() => buildCircuitGraph(elements, wires), [elements, wires]);

  // Снэп к сетке
  const snapToGrid = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

  // Преобразование координат экрана в координаты схемы
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = (clientX - rect.left - pan.x) / zoom;
      const rawY = (clientY - rect.top - pan.y) / zoom;
      return {
        x: snapToGrid(rawX),
        y: snapToGrid(rawY),
        rawX,
        rawY,
      };
    },
    [pan, zoom]
  );

  // Клавиатурные сокращения по руководству (стр. 4: R, F, V, ESC, Delete)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isPaletteOpen) {
        if (e.key === 'Escape') setIsPaletteOpen(false);
        return;
      }
      if (!shortcutsEnabled || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        setWiringFrom(null);
        setWiringCursor(null);
        setPendingComponentType(null);
        setSelectedId(null);
        setSelectedWireId(null);
      } else if ((e.key === 'r' || e.key === 'к' || e.key === 'R') && selectedId) {
        // Поворот по R (стр. 4)
        e.preventDefault();
        onElementsChange(
          elements.map((el) =>
            el.id === selectedId ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 } : el
          )
        );
      } else if ((e.key === 'f' || e.key === 'а' || e.key === 'F') && selectedId) {
        // Отразить слева направо (стр. 4)
        e.preventDefault();
        onElementsChange(
          elements.map((el) => (el.id === selectedId ? { ...el, flipH: !el.flipH } : el))
        );
      } else if ((e.key === 'v' || e.key === 'м' || e.key === 'V') && selectedId) {
        // Отразить сверху вниз (стр. 4)
        e.preventDefault();
        onElementsChange(
          elements.map((el) => (el.id === selectedId ? { ...el, flipV: !el.flipV } : el))
        );
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          onElementsChange(elements.filter((el) => el.id !== selectedId));
          onWiresChange(
            wires.filter((w) => w.fromCompId !== selectedId && w.toCompId !== selectedId)
          );
          setSelectedId(null);
        } else if (selectedWireId) {
          e.preventDefault();
          onWiresChange(wires.filter((w) => w.id !== selectedWireId));
          setSelectedWireId(null);
        }
      } else if (e.key === 'F9') {
        // F9 - Запуск моделирования
        e.preventDefault();
        onRunSimulation();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, selectedWireId, elements, wires, onElementsChange, onWiresChange, onRunSimulation, shortcutsEnabled, isPaletteOpen]);

  // Добавление нового компонента на схему
  const handlePlaceNewComponent = (type: ComponentType, worldX: number, worldY: number) => {
    const existingSameType = elements.filter((e) => e.type === type);
    const count = existingSameType.length + 1;

    let defaultName = `${type}${count}`;
    let defaultValue = 1000;
    let defaultValueStr = '1k';
    let defaultUnit = 'Ом';
    let portName = '';

    if (type === 'R') {
      defaultName = `R${count}`;
      defaultValue = 1000;
      defaultValueStr = '1 кОм';
      defaultUnit = 'Ом';
    } else if (type === 'L') {
      defaultName = `L${count}`;
      defaultValue = 10e-3;
      defaultValueStr = '10 мГн';
      defaultUnit = 'Гн';
    } else if (type === 'C') {
      defaultName = `C${count}`;
      defaultValue = 1e-6;
      defaultValueStr = '1 мкФ';
      defaultUnit = 'Ф';
    } else if (type === 'DIODE') {
      defaultName = `VD${count}`;
      defaultValue = 0;
      defaultValueStr = 'Диод';
      defaultUnit = '';
    } else if (type === 'THYRISTOR') {
      defaultName = `VS${count}`;
      defaultValue = 0;
      defaultValueStr = 'Тиристор';
      defaultUnit = '';
    } else if (type === 'SWITCH') {
      defaultName = `SW${count}`;
      defaultValue = 20000;
      defaultValueStr = '20 кГц';
      defaultUnit = 'Гц';
    } else if (type === 'V_DC') {
      defaultName = `U${count}`;
      defaultValue = 12;
      defaultValueStr = '12 В';
      defaultUnit = 'В';
    } else if (type === 'V_AC') {
      defaultName = `U${count}`;
      defaultValue = 220;
      defaultValueStr = '220 В';
      defaultUnit = 'В';
    } else if (type === 'V_PULSE') {
      defaultName = `U${count}`;
      defaultValue = 5;
      defaultValueStr = '5 В';
      defaultUnit = 'В';
    } else if (type === 'I_DC') {
      defaultName = `I${count}`;
      defaultValue = 1;
      defaultValueStr = '1 А';
      defaultUnit = 'А';
    } else if (type === 'OPAMP') {
      defaultName = `ОУ${count}`;
      defaultValue = 1e6;
      defaultValueStr = '1M';
      defaultUnit = 'В/В';
    } else if (type === 'COMPARATOR') {
      defaultName = `COMP${count}`;
      defaultValue = 1e5;
      defaultValueStr = '100k';
      defaultUnit = 'В/В';
    } else if (type === 'GND') {
      defaultName = `GND${count}`;
      defaultValue = 0;
      defaultValueStr = '';
      defaultUnit = '';
    } else if (type === 'PORT') {
      portName = existingSameType.length === 0 ? 'OUT' : `P${count}`;
      defaultName = `PORT_${portName}`;
      defaultValue = 0;
      defaultValueStr = '';
      defaultUnit = '';
    } else if (type === 'NOT') {
      defaultName = `NOT${count}`;
      defaultValue = 0;
      defaultValueStr = 'НЕ';
      defaultUnit = '';
    } else if (type === 'AND') {
      defaultName = `AND${count}`;
      defaultValue = 0;
      defaultValueStr = '&';
      defaultUnit = '';
    } else if (type === 'OR') {
      defaultName = `OR${count}`;
      defaultValue = 0;
      defaultValueStr = '≥1';
      defaultUnit = '';
    } else if (type === 'XOR') {
      defaultName = `XOR${count}`;
      defaultValue = 0;
      defaultValueStr = '=1';
      defaultUnit = '';
    } else if (type === 'RS_FF') {
      defaultName = `RS${count}`;
      defaultValue = 0;
      defaultValueStr = 'RS-FF';
      defaultUnit = '';
    } else if (type === 'D_FF') {
      defaultName = `D${count}`;
      defaultValue = 0;
      defaultValueStr = 'D-FF';
      defaultUnit = '';
    } else if (type === 'JK_FF') {
      defaultName = `JK${count}`;
      defaultValue = 0;
      defaultValueStr = 'JK-FF';
      defaultUnit = '';
    } else if (type === 'TR3') {
      defaultName = `TR${count}`;
      defaultValue = 1;
      defaultValueStr = 'k=1';
      defaultUnit = '';
    } else if (type === 'JUNCTION') {
      defaultName = `N${count}`;
      defaultValue = 0;
      defaultValueStr = '';
      defaultUnit = '';
    } else if (type === 'TEXT') {
      defaultName = `TXT${count}`;
      defaultValue = 0;
      defaultValueStr = '';
      defaultUnit = '';
    }

    const newElem: CircuitElement = {
      id: `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      name: defaultName,
      x: worldX,
      y: worldY,
      rotation: 0,
      value: defaultValue,
      valueStr: defaultValueStr,
      unit: defaultUnit,
      portName,
      textDirective: type === 'TEXT' ? '.define Rload = 100;' : undefined,
    };

    onElementsChange([...elements, newElem]);
    setSelectedId(newElem.id);
    setPendingComponentType(null);
  };

  // Координаты всех выводов компонентов схемы
  const pinPositions = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; name: string; label?: string; relX: number; relY: number; elType: string }
    >();
    for (const el of elements) {
      const pins = getComponentPins(el);
      for (const p of pins) {
        map.set(`${el.id}_${p.id}`, {
          x: el.x + p.x,
          y: el.y + p.y,
          name: p.name,
          label: p.label,
          relX: p.x,
          relY: p.y,
          elType: el.type,
        });
      }
    }
    return map;
  }, [elements]);

  // Геометрия всех проводов с ортогональной трассировкой (под прямым углом)
  const wireGeometries = useMemo(() => {
    const occupied: Array<{ node: number | undefined; points: Point[] }> = [];
    const geometries: Array<{
      wire: CircuitWire;
      p1: NonNullable<ReturnType<typeof pinPositions.get>>;
      p2: NonNullable<ReturnType<typeof pinPositions.get>>;
      points: Point[];
      pathD: string;
    }> = [];

    for (const wire of wires) {
      const p1 = pinPositions.get(`${wire.fromCompId}_${wire.fromPinId}`);
      const p2 = pinPositions.get(`${wire.toCompId}_${wire.toPinId}`);
      if (!p1 || !p2) continue;
      const node = circuitGraph.pinToNode.get(`${wire.fromCompId}_${wire.fromPinId}`);
      const foreignRoutes = occupied.filter(route => route.node !== node).map(route => route.points);

      let pts: Point[];
      if (wire.waypoints?.length) {
        pts = simplifyPoints([p1, ...wire.waypoints, p2]);
      } else {
        const offsets = [0, GRID_SIZE, -GRID_SIZE, GRID_SIZE * 2, -GRID_SIZE * 2, GRID_SIZE * 3, -GRID_SIZE * 3];
        const candidates = offsets.map(offset => computeOrthogonalWirePoints(
          p1,
          p2,
          { x: p1.relX, y: p1.relY },
          { x: p2.relX, y: p2.relY },
          p1.elType,
          p2.elType,
          offset
        ));
        pts = candidates.reduce((best, candidate) =>
          overlappingLength(candidate, foreignRoutes) < overlappingLength(best, foreignRoutes) ? candidate : best
        );
      }

      occupied.push({ node, points: pts });
      geometries.push({ wire, p1, p2, points: pts, pathD: pointsToSvgPath(pts) });
    }
    return geometries;
  }, [wires, pinPositions, circuitGraph]);

  // Разделение провода и создание подвижного узла (JUNCTION)
  const handleWirePointClick = (wireId: string, px: number, py: number) => {
    if (activeTool !== 'wire' || pendingComponentType) return;
    const targetWire = wires.find((w) => w.id === wireId);
    if (!targetWire) return;

    // Создаем новый узел соединения (JUNCTION по ГОСТ 2.702)
    const junctionCount = elements.filter((el) => el.type === 'JUNCTION').length + 1;
    const junctionId = `junction_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newJunction: CircuitElement = {
      id: junctionId,
      type: 'JUNCTION',
      name: `N${junctionCount}`,
      x: px,
      y: py,
      rotation: 0,
      value: 0,
      valueStr: '',
      unit: '',
    };

    // Заменяем исходный провод на 2 новых, сходящихся в этом узле
    const wireA: CircuitWire = {
      id: `wire_${Date.now()}_a_${Math.random().toString(36).slice(2, 6)}`,
      fromCompId: targetWire.fromCompId,
      fromPinId: targetWire.fromPinId,
      toCompId: junctionId,
      toPinId: '1',
    };
    const wireB: CircuitWire = {
      id: `wire_${Date.now()}_b_${Math.random().toString(36).slice(2, 6)}`,
      fromCompId: junctionId,
      fromPinId: '1',
      toCompId: targetWire.toCompId,
      toPinId: targetWire.toPinId,
    };

    const remainingWires = wires.filter((w) => w.id !== wireId);

    const wiringSource = wiringFromRef.current ?? wiringFrom;
    if (wiringSource) {
      // Подключение протягиваемого провода к новому узлу соединения
      const wireC: CircuitWire = {
        id: `wire_${Date.now()}_c_${Math.random().toString(36).slice(2, 6)}`,
        fromCompId: wiringSource.compId,
        fromPinId: wiringSource.pinId,
        toCompId: junctionId,
        toPinId: '1',
      };
      onElementsChange([...elements, newJunction]);
      onWiresChange([...remainingWires, wireA, wireB, wireC]);
      wiringFromRef.current = null;
      setWiringFrom(null);
      setWiringCursor(null);
      setSelectedId(junctionId);
      setSelectedWireId(null);
      setHoveredWirePoint(null);
      setHoveredPin(null);
    } else {
      onElementsChange([...elements, newJunction]);
      onWiresChange([...remainingWires, wireA, wireB]);
      setSelectedId(junctionId);
      setSelectedWireId(null);
      setHoveredWirePoint(null);
      setHoveredPin(null);
      if (activeTool === 'wire') {
        // Начинаем вести новый провод от созданного узла
        setWiringFrom({ compId: junctionId, pinId: '1', x: px, y: py });
        setWiringCursor({ x: px, y: py });
      } else {
        // СРАЗУ В РЕЖИМ ПЕРЕМЕЩЕНИЯ ДЛЯ СОЗДАННОГО УЗЛА!
        // Зажатие мыши на проводе сразу двигает новую точку, а не начинает вести провод
        setDraggingElemId(junctionId);
        setDragOffset({ x: 0, y: 0 });
      }
    }
  };

  // Клик по канвасу
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      // Правая кнопка мыши - отмена по мануалу стр. 4
      e.preventDefault();
      setWiringFrom(null);
      setWiringCursor(null);
      setPendingComponentType(null);
      return;
    }

    if (e.button === 1 || e.shiftKey) {
      // Панорамирование
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const pos = screenToWorld(e.clientX, e.clientY);

    // Если был выбран инструмент размещения
    if (pendingComponentType) {
      handlePlaceNewComponent(pendingComponentType, pos.x, pos.y);
      return;
    }

    // Выводы и точки на проводах подключаются только инструментом «Проводка».
    if (activeTool === 'wire' && hoveredPin) {
      handlePinClick(e, hoveredPin.compId, hoveredPin.pinId, hoveredPin.x, hoveredPin.y);
      return;
    }

    // Если кликнули по проводу — создаем узел соединения и подключаем провод
    if (activeTool === 'wire' && hoveredWirePoint) {
      handleWirePointClick(hoveredWirePoint.wireId, hoveredWirePoint.x, hoveredWirePoint.y);
      return;
    }

    // Если клик в пустое место
    setSelectedId(null);
    setSelectedWireId(null);
    // Пустое место не является электрическим соединением. Esc/ПКМ отменяет провод.
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    const pos = screenToWorld(e.clientX, e.clientY);
    setMouseWorldPos({ x: pos.x, y: pos.y });

    // При активном перетаскивании элемента/точки — сразу обновляем координаты и выходим,
    // не пересчитывая hover, чтобы исключить любые конфликты и дерганья проводов
    if (draggingElemId) {
      if (e.buttons === 0) { setDraggingElemId(null); return; }
      setHoveredPin(null);
      setHoveredWirePoint(null);
      const targetX = snapToGrid(pos.rawX - dragOffset.x);
      const targetY = snapToGrid(pos.rawY - dragOffset.y);
      onElementsChange(
        elements.map((el) => (el.id === draggingElemId ? { ...el, x: targetX, y: targetY } : el))
      );
      return;
    }

    if (activeTool !== 'wire' || pendingComponentType) {
      setHoveredPin(null);
      setHoveredWirePoint(null);
      return;
    }

    // 1. Поиск ближайшего вывода (Магнитный захват с увеличенным радиусом 28px для надежной фиксации)
    let foundPin: { compId: string; pinId: string; x: number; y: number; name: string } | null = null;
    let minPinDist = 12 / zoom;
    for (const el of elements) {
      // Для узлов JUNCTION: не захватывать их как пин, если мы не находимся в режиме проводки,
      // чтобы пользователь мог легко захватить и двигать точку, а не тянуть из неё провод
      if (el.type === 'JUNCTION' && !wiringFrom && activeTool !== 'wire') {
        continue;
      }
      const pins = getComponentPins(el);
      for (const p of pins) {
        const absX = el.x + p.x;
        const absY = el.y + p.y;
        const dist = Math.hypot(pos.rawX - absX, pos.rawY - absY);
        if (dist <= minPinDist) {
          minPinDist = dist;
          foundPin = { compId: el.id, pinId: p.id, x: absX, y: absY, name: `${el.name}.${p.name}` };
        }
      }
    }
    setHoveredPin(foundPin);

    // 2. Если пин не найден — проверяем наведение на сегменты существующих проводов
    let foundWirePoint: { wireId: string; x: number; y: number } | null = null;
    if (!foundPin) {
      let minWireDist = 8 / zoom;
      for (const wg of wireGeometries) {
        const pts = wg.points;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const isHorizontal = Math.abs(a.y - b.y) < 1;
          const isVertical = Math.abs(a.x - b.x) < 1;

          if (isHorizontal) {
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            if (pos.rawX >= minX - 12 && pos.rawX <= maxX + 12) {
              const d = Math.abs(pos.rawY - a.y);
              if (d <= minWireDist) {
                minWireDist = d;
                const clampedX = Math.max(minX, Math.min(maxX, pos.rawX));
                foundWirePoint = { wireId: wg.wire.id, x: Math.max(minX, Math.min(maxX, snapToGrid(clampedX))), y: a.y };
              }
            }
          } else if (isVertical) {
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            if (pos.rawY >= minY - 12 && pos.rawY <= maxY + 12) {
              const d = Math.abs(pos.rawX - a.x);
              if (d <= minWireDist) {
                minWireDist = d;
                const clampedY = Math.max(minY, Math.min(maxY, pos.rawY));
                foundWirePoint = { wireId: wg.wire.id, x: a.x, y: Math.max(minY, Math.min(maxY, snapToGrid(clampedY))) };
              }
            }
          }
        }
      }
    }
    setHoveredWirePoint(foundWirePoint);

    // 3. Обновление положения проводки при протягивании
    if (wiringFrom) {
      if (foundPin && (foundPin.compId !== wiringFrom.compId || foundPin.pinId !== wiringFrom.pinId)) {
        // Фиксация точно в точке вывода
        setWiringCursor({ x: foundPin.x, y: foundPin.y });
      } else if (foundWirePoint) {
        // Фиксация точно в точке на проводе
        setWiringCursor({ x: foundWirePoint.x, y: foundWirePoint.y });
      } else {
        // Плавное следование строго по сетке 20px
        setWiringCursor({ x: snapToGrid(pos.rawX), y: snapToGrid(pos.rawY) });
      }
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggingElemId) onEndContinuousEdit?.();
    if (wirePointerDown.current) {
      wirePointerDown.current = false;
      wiringFromRef.current = null;
      setWiringFrom(null);
      setWiringCursor(null);
    }
    setIsPanning(false);
    setDraggingElemId(null);
  };

  // Нажатие на вывод элемента (Pin)
  const handlePinClick = (e: React.MouseEvent, compId: string, pinId: string, px: number, py: number) => {
    if (activeTool !== 'wire' || pendingComponentType || e.button !== 0) return;
    e.stopPropagation();

    const wiringSource = wiringFromRef.current ?? wiringFrom;
    if (!wiringSource) {
      // Зажать кнопку на первом выводе и протянуть до цели.
      wirePointerDown.current = true;
      wiringFromRef.current = { compId, pinId, x: px, y: py };
      setWiringFrom({ compId, pinId, x: px, y: py });
      setWiringCursor({ x: px, y: py });
    } else {
      // Завершение соединения двух выводов (клик по целевому выводу)
      if (wiringSource.compId === compId && wiringSource.pinId === pinId) {
        // Кликнули в тот же самый вывод — отмена
        setWiringFrom(null);
        wiringFromRef.current = null;
        setWiringCursor(null);
        return;
      }

      // Проверка на дубликат провода
      const exists = wires.some(
        (w) =>
          (w.fromCompId === wiringSource.compId &&
            w.fromPinId === wiringSource.pinId &&
            w.toCompId === compId &&
            w.toPinId === pinId) ||
          (w.fromCompId === compId &&
            w.fromPinId === pinId &&
            w.toCompId === wiringSource.compId &&
            w.toPinId === wiringSource.pinId)
      );

      if (!exists) {
        const newWire: CircuitWire = {
          id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fromCompId: wiringSource.compId,
          fromPinId: wiringSource.pinId,
          toCompId: compId,
          toPinId: pinId,
        };
        onWiresChange([...wires, newWire]);
      }

      setWiringFrom(null);
      wiringFromRef.current = null;
      setWiringCursor(null);
      wirePointerDown.current = false;
    }
  };

  const handlePinMouseUp = (e: React.MouseEvent, compId: string, pinId: string, px: number, py: number) => {
    if (!wirePointerDown.current || activeTool !== 'wire') return;
    e.stopPropagation();
    wirePointerDown.current = false;
    handlePinClick(e, compId, pinId, px, py);
  };

  // Нажатие на элемент
  const handleElementMouseDown = (e: React.MouseEvent, el: CircuitElement) => {
    if (e.button === 1 || e.shiftKey) return;
    e.stopPropagation();
    if (e.button === 2) {
      // Правая кнопка мыши — отмена проводки и инструмента
      setWiringFrom(null);
      setWiringCursor(null);
      setPendingComponentType(null);
      return;
    }

    const pos = screenToWorld(e.clientX, e.clientY);

    if (pendingComponentType) return;
    if (activeTool === 'select') {
      setSelectedId(el.id);
      setSelectedWireId(null);
      onSelectElement(el);
      setWiringFrom(null);
      setWiringCursor(null);
      onBeginContinuousEdit?.();
      setDraggingElemId(el.id);
      setDragOffset({ x: pos.rawX - el.x, y: pos.rawY - el.y });
      return;
    }

    // СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ ТОЧКИ СОЕДИНЕНИЯ (JUNCTION):
    // При зажатии мыши точка должна свободно двигаться, а не вести новый провод!
    if (el.type === 'JUNCTION') {
      if (wiringFrom) {
        // Завершаем проводку к этому узлу
        handlePinClick(e, el.id, '1', el.x, el.y);
        return;
      }
      if (activeTool === 'wire') {
        // Если явно выбран инструмент "Провод" — тянем провод от узла
        handlePinClick(e, el.id, '1', el.x, el.y);
        return;
      }
      if (activeTool === 'delete') {
        onElementsChange(elements.filter((item) => item.id !== el.id));
        onWiresChange(wires.filter((w) => w.fromCompId !== el.id && w.toCompId !== el.id));
        return;
      }
      // Обычный режим (инструмент "Выбор"): выделяем и сразу начинаем двигать узел при зажатии!
      setSelectedId(el.id);
      setSelectedWireId(null);
      onSelectElement(el);
      onBeginContinuousEdit?.();
      setDraggingElemId(el.id);
      setDragOffset({ x: pos.rawX - el.x, y: pos.rawY - el.y });
      return;
    }

    const pins = getComponentPins(el);

    // 1. Если кликнули возле подсвеченного вывода или в радиусе 24px от любого пина — СРАЗУ ПРОВОДКА!
    if (hoveredPin && hoveredPin.compId === el.id) {
      handlePinClick(e, hoveredPin.compId, hoveredPin.pinId, hoveredPin.x, hoveredPin.y);
      return;
    }

    for (const p of pins) {
      const absX = el.x + p.x;
      const absY = el.y + p.y;
      if (Math.hypot(pos.rawX - absX, pos.rawY - absY) <= 12 / zoom) {
        handlePinClick(e, el.id, p.id, absX, absY);
        return;
      }
    }

    // 2. Если сейчас активен режим проводки и кликнули по элементу рядом с выводом (радиус 36px) — завершаем проводку к нему
    if (wiringFrom) {
      let closestPin = pins[0];
      let minDist = Infinity;
      for (const p of pins) {
        const absX = el.x + p.x;
        const absY = el.y + p.y;
        const dist = Math.hypot(pos.rawX - absX, pos.rawY - absY);
        if (dist < minDist) {
          minDist = dist;
          closestPin = p;
        }
      }
      if (closestPin && minDist <= 12 / zoom) {
        handlePinClick(e, el.id, closestPin.id, el.x + closestPin.x, el.y + closestPin.y);
        return;
      }
    }

    // 3. Стандартный выбор и перетаскивание элемента
    setSelectedId(el.id);
    setSelectedWireId(null);
    onSelectElement(el);

  };

  // Двойной щелчок по элементу: открытие окна параметров (стр. 4: "двойной щелчок мышью - появится окно параметров")
  const handleElementDoubleClick = (e: React.MouseEvent, el: CircuitElement) => {
    e.stopPropagation();
    if (activeTool !== 'select' || pendingComponentType) return;
    onOpenProperties(el);
  };

  return (
    <div className="schematic-editor flex flex-col h-full bg-slate-100 select-none border border-slate-300 rounded overflow-hidden text-slate-800">
      {/* Верхняя панель инструментов редактора. */}
      <div className="schematic-toolbar border-b border-slate-300 flex flex-wrap items-center justify-between shrink-0 z-20">
        {/* Кнопки инструментов и быстрый выбор компонентов */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Инструмент: Указатель / Выбор */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('select');
              setHoveredPin(null);
              setHoveredWirePoint(null);
              setWiringFrom(null);
              setWiringCursor(null);
              setPendingComponentType(null);
            }}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 border cursor-pointer ${
              activeTool === 'select' && !pendingComponentType && !wiringFrom
                ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="Инструмент «Выбор»: выделение и перемещение элементов (Esc для сброса)"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span className="font-semibold">Выбор</span>
          </button>

          {/* Инструмент: Проводка (соединение выводов) */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('wire');
              setPendingComponentType(null);
              setSelectedId(null);
              setSelectedWireId(null);
              setDraggingElemId(null);
              setWiringFrom(null);
              setWiringCursor(null);
            }}
            className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition-all ${
              activeTool === 'wire' || wiringFrom
                ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="Инструмент «Проводка»: зажмите кнопку на выводе и протяните до другого вывода или провода"
          >
            <Cable className="w-3.5 h-3.5" />
            <span>Проводка</span>
            {wiringFrom && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-0.5" />
            )}
          </button>

          <div className="h-4 w-px bg-slate-300 mx-0.5" />

          {/* БЫСТРЫЙ ВЫБОР ОСНОВНЫХ КОМПОНЕНТОВ ПРЯМО НА ПАНЕЛИ */}
          <div className="flex items-center gap-0.5 bg-white border border-slate-300 rounded p-0.5 shadow-2xs">
            {[
              { type: 'GND', label: 'Земля', badge: '⏚' },
              { type: 'JUNCTION', label: 'Узел', badge: '•' },
              { type: 'R', label: 'Резистор', badge: 'R' },
              { type: 'C', label: 'Конденсатор', badge: 'C' },
              { type: 'L', label: 'Катушка', badge: 'L' },
              { type: 'DIODE', label: 'Диод', badge: 'VD' },
              { type: 'SWITCH', label: 'Ключ', badge: 'SW' },
              { type: 'V_DC', label: 'Udc', badge: 'U' },
              { type: 'V_PULSE', label: 'ШИМ', badge: '⎍' },
            ].map((item) => {
              const isSelected = pendingComponentType === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setPendingComponentType(null);
                    } else {
                      setPendingComponentType(item.type as ComponentType);
                      setActiveTool('select');
                      setWiringFrom(null);
                      setWiringCursor(null);
                    }
                  }}
                  className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-blue-600'
                  }`}
                  title={`Добавить «${item.label}» (кликните, затем кликните на поле схемы)`}
                >
                  <ComponentSymbol type={item.type as ComponentType} className="quick-component-symbol" />
                  <span className="hidden 2xl:inline text-2xs">{item.label}</span>
                </button>
              );
            })}

            {/* Кнопка открытия полной библиотеки компонентов */}
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="px-2 py-1 rounded text-2xs font-semibold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer ml-0.5 transition-colors"
              title="Открыть полную библиотеку компонентов (ОУ, логика, триггеры, трансформаторы и т.д.)"
            >
              <Layers className="w-3 h-3 text-blue-600" />
              <span>Библиотека...</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-0.5" />

          {/* Повернуть (R) */}
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => {
              if (selectedId) {
                onElementsChange(
                  elements.map((el) =>
                    el.id === selectedId
                      ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 }
                      : el
                  )
                );
              }
            }}
            className="p-1 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 border border-slate-300 rounded text-xs shadow-2xs cursor-pointer"
            title="Повернуть выбранный элемент (R)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Удалить (Del) */}
          <button
            type="button"
            disabled={!selectedId && !selectedWireId}
            onClick={() => {
              if (selectedId) {
                onElementsChange(elements.filter((el) => el.id !== selectedId));
                onWiresChange(
                  wires.filter((w) => w.fromCompId !== selectedId && w.toCompId !== selectedId)
                );
                setSelectedId(null);
              } else if (selectedWireId) {
                onWiresChange(wires.filter((w) => w.id !== selectedWireId));
                setSelectedWireId(null);
              }
            }}
            className="p-1 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-rose-700 border border-slate-300 rounded text-xs shadow-2xs cursor-pointer"
            title="Удалить выбранный элемент или провод (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Номера узлов (стр. 4 мануала) */}
          <button
            type="button"
            onClick={() => setShowNodeNumbers(!showNodeNumbers)}
            className={`px-2 py-1 border border-slate-300 rounded text-xs font-medium flex items-center gap-1 shadow-2xs cursor-pointer ${
              showNodeNumbers ? 'bg-indigo-50 border-indigo-400 text-indigo-800' : 'bg-white text-slate-700'
            }`}
            title="Отображение номеров узлов схемы"
          >
            <Hash className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Узлы</span>
          </button>

          {/* Загрузка готовых схем из руководства */}
          <div className="relative group">
            <button
              type="button"
              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-medium flex items-center gap-1 shadow-2xs cursor-pointer"
              title="Открыть готовую схему Voltaris"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden md:inline">Примеры...</span>
            </button>
            <div className="hidden group-hover:block group-focus-within:block absolute left-0 top-full bg-white border border-slate-300 shadow-lg rounded py-1 z-50 w-72 text-xs">
              <div className="px-3 py-1 text-3xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                Примеры схем Voltaris:
              </div>
              {SAMPLE_CIRCUITS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onLoadSample(sc)}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 flex flex-col cursor-pointer border-b border-slate-100 last:border-none"
                >
                  <span className="font-semibold text-slate-800">{sc.name}</span>
                  <span className="text-3xs text-slate-500 truncate">{sc.pageRef} • {sc.category}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Очистить поле */}
          <button
            type="button"
            onClick={() => {
              if (confirm('Создать новую пустую схему?')) {
                onElementsChange([]);
                onWiresChange([]);
              }
            }}
            className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-medium flex items-center gap-1 shadow-2xs cursor-pointer"
            title="Очистить схему"
          >
            <FilePlus className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Очистить</span>
          </button>
        </div>

        {/* Правая часть тулбара: Масштаб и ВЫДЕЛЕННАЯ КНОПКА «Построить график» */}
        <div className="flex items-center gap-2">
          {/* Масштабирование */}
          <div className="flex items-center gap-0.5 bg-white border border-slate-300 rounded p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
              className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
              title="Уменьшить масштаб"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-3xs font-mono px-1 font-semibold text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
              className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
              title="Увеличить масштаб"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={fitToView}
              className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
              title="Показать схему целиком"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-300 mx-0.5" />

          {/* ВЫДЕЛЕННАЯ КНОПКА ПОСТРОЕНИЯ ГРАФИКА */}
          <button
            type="button"
            disabled={isSimulating}
            onClick={() => {
              if (onBuildPlot) onBuildPlot();
              else onRunSimulation();
            }}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            title="Построить график сигналов схемы"
          >
            <Activity className="w-4 h-4" />
            <span>{isSimulating ? 'Расчёт…' : 'Рассчитать схему'}</span>
          </button>

          {/* Настройки переходного процесса */}
          <button
            type="button"
            onClick={onOpenTransientSettings}
            className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded shadow-2xs cursor-pointer"
            title="Параметры расчета (t_max, шаг)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. ЧИСТОЕ РАБОЧЕЕ ПОЛОТНО СХЕМЫ (CANVAS) НА ВЕСЬ ЭКРАН */}
      <div className="flex-1 w-full h-full min-h-0 overflow-hidden relative">
        {/* Информационные плашки режима добавления / проводки */}
        {pendingComponentType && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-blue-600 text-white px-4 py-1.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
            <span>Кликните на схему для размещения компонента</span>
            <button
              type="button"
              onClick={() => setPendingComponentType(null)}
              className="ml-2 hover:bg-blue-700 p-0.5 rounded cursor-pointer"
              title="Отмена"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {wiringFrom && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white px-4 py-1.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Проводка активна: удерживайте кнопку и протяните до контакта или провода</span>
            <button
              type="button"
              onClick={() => {
                setWiringFrom(null);
                setWiringCursor(null);
              }}
              className="ml-2 hover:bg-slate-800 p-0.5 rounded cursor-pointer"
              title="Отмена проводки"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* МОДАЛЬНОЕ ОКНО ПОЛНОЙ БИБЛИОТЕКИ ЭЛЕМЕНТОВ (НЕ СЖИМАЕТ И НЕ ПЕРЕКРЫВАЕТ СХЕМУ) */}
        {isPaletteOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsPaletteOpen(false);
            }}
          >
            <div role="dialog" aria-modal="true" aria-label="Библиотека компонентов" className="library-dialog bg-white shadow-2xl overflow-hidden flex flex-col">
              <div className="library-dialog-header flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-sm text-slate-800">
                    Библиотека компонентов Voltaris
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPaletteOpen(false)}
                  className="p-1 hover:bg-slate-200 text-slate-600 rounded cursor-pointer transition-colors"
                  title="Закрыть библиотеку"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <ComponentPalette
                  selectedType={pendingComponentType}
                  onSelectType={(t) => {
                    setPendingComponentType(t);
                    setIsPaletteOpen(false);
                    if (t) setActiveTool('select');
                  }}
                  className="h-full border-none rounded-none shadow-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ОСНОВНОЙ CANVAS СХЕМЫ */}
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          className="w-full h-full relative overflow-hidden bg-white cursor-crosshair select-none"
        >
        <svg
          className="w-full h-full block"
          style={{
            cursor: isPanning ? 'grabbing' : pendingComponentType ? 'copy' : activeTool === 'wire' ? 'crosshair' : 'default',
          }}
        >
          <defs>
            {/* Сетка чертежного поля (20x20). */}
            <pattern
              id="voltaris_grid"
              width={GRID_SIZE * zoom}
              height={GRID_SIZE * zoom}
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x}, ${pan.y})`}
            >
              <circle
                cx={GRID_SIZE * zoom}
                cy={GRID_SIZE * zoom}
                r={1.2}
                fill="#cbd5e1"
              />
            </pattern>
          </defs>

          {/* Фоновая сетка */}
          <rect width="100%" height="100%" fill="url(#voltaris_grid)" />

          {/* Группа элементов схемы с масштабированием и панорамированием */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* ПРОВОДА СХЕМЫ (WIRES) С ОРТОГОНАЛЬНОЙ ТРАССИРОВКОЙ И T-ОТВЕТВЛЕНИЯМИ */}
            {wireGeometries.map((wg) => {
              const { wire, pathD } = wg;
              const isSelected = selectedWireId === wire.id;
              const isHovered = hoveredWirePoint?.wireId === wire.id;

              return (
                <g
                  key={wire.id}
                  onMouseDown={(e) => {
                    if (e.button === 1 || e.shiftKey) return;
                    e.stopPropagation();
                    if (e.button === 2) { setWiringFrom(null); setWiringCursor(null); return; }
                    if (e.button !== 0 || pendingComponentType) return;
                    if (activeTool === 'wire') {
                      const pos = screenToWorld(e.clientX, e.clientY);
                      // Project onto the actual segment, never beside the wire.
                      const candidates = wg.points.slice(1).map((end, index) => {
                        const start = wg.points[index];
                        return Math.abs(start.y - end.y) < 1
                          ? { x: Math.max(Math.min(start.x, end.x), Math.min(Math.max(start.x, end.x), snapToGrid(pos.rawX))), y: start.y }
                          : { x: start.x, y: Math.max(Math.min(start.y, end.y), Math.min(Math.max(start.y, end.y), snapToGrid(pos.rawY))) };
                      });
                      const point = candidates.sort((a, b) => Math.hypot(a.x - pos.rawX, a.y - pos.rawY) - Math.hypot(b.x - pos.rawX, b.y - pos.rawY))[0];
                      if (point) handleWirePointClick(wire.id, point.x, point.y);
                      return;
                    }
                    setSelectedWireId(wire.id);
                    setSelectedId(null);
                  }}
                  onMouseUp={(e) => {
                    if (!wirePointerDown.current || activeTool !== 'wire') return;
                    e.stopPropagation();
                    wirePointerDown.current = false;
                    const pos = screenToWorld(e.clientX, e.clientY);
                    const candidates = wg.points.slice(1).map((end, index) => {
                      const start = wg.points[index];
                      return Math.abs(start.y - end.y) < 1
                        ? { x: Math.max(Math.min(start.x, end.x), Math.min(Math.max(start.x, end.x), snapToGrid(pos.rawX))), y: start.y }
                        : { x: start.x, y: Math.max(Math.min(start.y, end.y), Math.min(Math.max(start.y, end.y), snapToGrid(pos.rawY))) };
                    });
                    const point = candidates.sort((a, b) => Math.hypot(a.x - pos.rawX, a.y - pos.rawY) - Math.hypot(b.x - pos.rawX, b.y - pos.rawY))[0];
                    if (point) handleWirePointClick(wire.id, point.x, point.y);
                  }}
                >
                  {/* Широкая невидимая линия для легкого клика и захвата мышью */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="cursor-pointer"
                  />
                  {/* Подсветка сегмента провода при наведении */}
                  {isHovered && !isSelected && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={3.5}
                      strokeOpacity={0.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Видимый провод схемы под прямыми углами */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? '#2563eb' : '#1e293b'}
                    strokeWidth={isSelected ? 2.5 : 1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            {/* Протягиваемый в данный момент провод под строгими прямыми углами */}
            {wiringFrom && wiringCursor && (() => {
              const fromPin = pinPositions.get(`${wiringFrom.compId}_${wiringFrom.pinId}`);
              const pts = computeOrthogonalWirePoints(
                wiringFrom,
                wiringCursor,
                fromPin ? { x: fromPin.relX, y: fromPin.relY } : undefined,
                undefined,
                fromPin?.elType,
                undefined
              );
              return (
                <path
                  d={pointsToSvgPath(pts)}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })()}

            {/* Индикатор новой точки соединения (Узла) на проводе */}
            {activeTool === 'wire' && hoveredWirePoint && (
              <g transform={`translate(${hoveredWirePoint.x}, ${hoveredWirePoint.y})`} pointerEvents="none">
                <circle r={10} fill="#10b981" fillOpacity={0.25} stroke="#059669" strokeWidth={1.5} />
                <circle r={4.5} fill="#059669" stroke="#ffffff" strokeWidth={1.2} />
                <g transform="translate(12, -18)">
                  <rect width={155} height={18} rx={3} fill="#0f172a" fillOpacity={0.9} />
                  <text
                    x={77}
                    y={12}
                    textAnchor="middle"
                    fill="#ffffff"
                    style={{ fontSize: '9px', fontFamily: 'sans-serif', fontWeight: 600 }}
                  >
                    {wiringFrom ? '+ Соединить в новый узел' : '+ Создать узел соединения'}
                  </text>
                </g>
              </g>
            )}

            {/* ЭЛЕМЕНТЫ СХЕМЫ (COMPONENTS) */}
            {elements.map((el) => {
              const isSelected = selectedId === el.id;
              const pins = getComponentPins(el);

              return (
                <g
                  key={el.id}
                  transform={`translate(${el.x}, ${el.y})`}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                  onMouseUp={(e) => {
                    if (el.type === 'JUNCTION') handlePinMouseUp(e, el.id, '1', el.x, el.y);
                  }}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  className="cursor-move"
                >
                  {/* Рамка выделения */}
                  {isSelected && el.type !== 'JUNCTION' && (
                    <rect
                      x={-42}
                      y={-32}
                      width={84}
                      height={64}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.2}
                      strokeDasharray="3 3"
                      rx={3}
                    />
                  )}
                  {isSelected && el.type === 'JUNCTION' && (
                    <circle
                      cx={0}
                      cy={0}
                      r={9}
                      fill="#3b82f6"
                      fillOpacity={0.25}
                      stroke="#2563eb"
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Отрисовка символа компонента */}
                  <g
                    transform={`rotate(${el.rotation || 0}) scale(${el.flipH ? -1 : 1}, ${
                      el.flipV ? -1 : 1
                    })`}
                  >
                    {renderComponentSymbol(el)}
                  </g>

                  {/* Текстовые подписи: имя и номинал */}
                  {el.type !== 'TEXT' && el.type !== 'JUNCTION' && (
                    <g className="pointer-events-none select-none">
                      <text
                        x={0}
                        y={-18}
                        textAnchor="middle"
                        className="text-xs font-mono font-bold fill-slate-800"
                        style={{ fontSize: '11px' }}
                      >
                        {el.name}
                      </text>
                      {el.valueStr && (
                        <text
                          x={0}
                          y={28}
                          textAnchor="middle"
                          className="text-xs font-mono fill-indigo-700"
                          style={{ fontSize: '10px' }}
                        >
                          {el.valueStr}
                        </text>
                      )}
                    </g>
                  )}

                  {/* Выводы элемента (Pins с магнитным притягиванием и подсветкой) — только для стандартных компонентов */}
                  {el.type !== 'JUNCTION' &&
                    pins.map((pin) => {
                      const absPx = el.x + pin.x;
                      const absPy = el.y + pin.y;
                      const pinKey = `${el.id}_${pin.id}`;
                      const nodeNum = circuitGraph.pinToNode.get(pinKey);
                      const isWiringSource = wiringFrom?.compId === el.id && wiringFrom?.pinId === pin.id;
                      const isHovered = hoveredPin?.compId === el.id && hoveredPin?.pinId === pin.id;

                      return (
                        <g key={pin.id}>
                          {/* Ореол подсветки вывода */}
                          {(isHovered || isWiringSource) && (
                            <circle
                              cx={pin.x}
                              cy={pin.y}
                              r={10}
                              fill={isWiringSource ? '#3b82f6' : '#10b981'}
                              fillOpacity={0.25}
                              stroke={isWiringSource ? '#2563eb' : '#059669'}
                              strokeWidth={1.5}
                            />
                          )}

                          {/* Широкая невидимая область клика (радиус 18px) для безошибочного захвата мышью */}
                          <circle
                            cx={pin.x}
                            cy={pin.y}
                            r={12 / zoom}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseDown={(e) => handlePinClick(e, el.id, pin.id, absPx, absPy)}
                            onMouseUp={(e) => handlePinMouseUp(e, el.id, pin.id, absPx, absPy)}
                          />

                          {/* Терминал для клика проводки */}
                          <circle
                            cx={pin.x}
                            cy={pin.y}
                            r={isHovered ? 6 : 4}
                            fill={isWiringSource ? '#2563eb' : isHovered ? '#10b981' : '#ffffff'}
                            stroke={isWiringSource ? '#1d4ed8' : isHovered ? '#059669' : '#2563eb'}
                            strokeWidth={isHovered || isWiringSource ? 2.5 : 1.75}
                            className="cursor-pointer transition-all"
                            onMouseDown={(e) => handlePinClick(e, el.id, pin.id, absPx, absPy)}
                            onMouseUp={(e) => handlePinMouseUp(e, el.id, pin.id, absPx, absPy)}
                          />

                          {/* Всплывающий бейдж при проводке */}
                          {isHovered && wiringFrom && !isWiringSource && (
                            <g transform={`translate(${pin.x + 8}, ${pin.y - 18})`} pointerEvents="none">
                              <rect width={70} height={16} rx={3} fill="#0f172a" fillOpacity={0.9} />
                              <text
                                x={35}
                                y={11}
                                textAnchor="middle"
                                fill="#ffffff"
                                style={{ fontSize: '9px', fontFamily: 'sans-serif', fontWeight: 600 }}
                              >
                                Соединить
                              </text>
                            </g>
                          )}

                          {/* Название вывода */}
                          {pin.label && (
                            <text
                              x={pin.x + (pin.x < 0 ? 6 : -6)}
                              y={pin.y + (pin.y < 0 ? 8 : -4)}
                              textAnchor={pin.x < 0 ? 'start' : 'end'}
                              className="font-mono text-3xs font-bold fill-slate-700 pointer-events-none select-none"
                              style={{ fontSize: '9px' }}
                            >
                              {pin.label}
                            </text>
                          )}

                          {/* Номер узла схемы (стр. 4: "Номера узлов") */}
                          {showNodeNumbers && nodeNum !== undefined && (
                            <text
                              x={pin.x + 8}
                              y={pin.y - 6}
                              className="font-mono text-3xs fill-slate-500 font-semibold select-none pointer-events-none"
                              style={{ fontSize: '9px' }}
                            >
                              [{nodeNum === 0 ? '0' : nodeNum}]
                            </text>
                          )}
                        </g>
                      );
                    })}

                  {/* Ореол и подсказка соединения для узла (JUNCTION) во время проводки */}
                  {el.type === 'JUNCTION' && hoveredPin?.compId === el.id && (
                    <g pointerEvents="none">
                      <circle
                        cx={0}
                        cy={0}
                        r={10}
                        fill="#10b981"
                        fillOpacity={0.25}
                        stroke="#059669"
                        strokeWidth={1.5}
                      />
                      {wiringFrom && wiringFrom.compId !== el.id && (
                        <g transform="translate(8, -18)">
                          <rect width={70} height={16} rx={3} fill="#0f172a" fillOpacity={0.9} />
                          <text
                            x={35}
                            y={11}
                            textAnchor="middle"
                            fill="#ffffff"
                            style={{ fontSize: '9px', fontFamily: 'sans-serif', fontWeight: 600 }}
                          >
                            Соединить
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Ghost-превью компонента при перемещении мыши */}
          {pendingComponentType && mouseWorldPos && (
            <g
              transform={`translate(${mouseWorldPos.x * zoom + pan.x}, ${mouseWorldPos.y * zoom + pan.y}) scale(${zoom})`}
              opacity={0.65}
              pointerEvents="none"
            >
              {renderComponentSymbol({
                id: 'ghost',
                type: pendingComponentType,
                name: '',
                x: 0,
                y: 0,
                rotation: 0,
                value: 0,
                valueStr: '',
                unit: '',
              })}
              <circle cx={0} cy={0} r={4} fill="#2563eb" />
            </g>
          )}
        </svg>
      </div>
    </div>
  </div>
  );
}

/**
 * Отрисовка графических символов элементов по ГОСТ 2.728 / IEEE (стр. 4-5 мануала)
 */
