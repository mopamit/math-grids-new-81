export type StrokeStyle = "solid" | "dashed" | "dotted";
export type Point = { x: number; y: number };
export type LabelOffsets = Record<string, Point>;

export type PointObject = {
  id: string;
  type: "point";
  name: string;
  x: number;
  y: number;
  color: string;
  hidden?: boolean;
  showName: boolean;
  showCoords: boolean;
  guides: boolean;
  labelOffsets?: LabelOffsets;
  dependency?:
    | { kind: "midpoint"; aId: string; bId: string }
    | { kind: "function"; functionId: string; x: number };
};

export type SegmentObject = {
  id: string;
  type: "segment" | "line";
  name: string;
  a: Point;
  b: Point;
  aId?: string;
  bId?: string;
  color: string;
  hidden?: boolean;
  showLength: boolean;
  showSlope: boolean;
  showLabel: boolean;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  labelOffsets?: LabelOffsets;
  construction?:
    | {
        kind: "parallel" | "perpendicular";
        sourceId?: string;
        sourceAId?: string;
        sourceBId?: string;
        throughId: string;
      }
    | {
        kind: "angleBisector";
        angleId?: string;
        aId?: string;
        vertexId?: string;
        cId?: string;
      }
    | {
        kind: "median";
        polygonId: string;
        vertexId: string;
      };
};

export type FunctionObject = {
  id: string;
  type: "function";
  name: string;
  expression: string;
  latex: string;
  functionKind: "linear" | "quadratic" | "general";
  color: string;
  hidden?: boolean;
  showEquation: boolean;
  showTable: boolean;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  labelOffsets?: LabelOffsets;
  domainMin?: number;
  domainMax?: number;
  minClosed: boolean;
  maxClosed: boolean;
};

export type AngleObject = {
  id: string;
  type: "angle";
  name: string;
  aId: string;
  vertexId: string;
  cId: string;
  color: string;
  hidden?: boolean;
  showMeasure: boolean;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  labelOffsets?: LabelOffsets;
};

export type PolygonObject = {
  id: string;
  type: "polygon";
  name: string;
  pointIds: string[];
  color: string;
  hidden?: boolean;
  fill: boolean;
  showLengths: boolean;
  showAngles: boolean;
  showPerimeter: boolean;
  showArea: boolean;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  labelOffsets?: LabelOffsets;
};

export type CircleObject = {
  id: string;
  type: "circle";
  name: string;
  centerId?: string;
  center: Point;
  throughId?: string;
  through?: Point;
  radius?: number;
  threePointIds?: [string, string, string];
  color: string;
  hidden?: boolean;
  fill: boolean;
  showCenter: boolean;
  showRadius: boolean;
  showDiameter: boolean;
  showCircumference: boolean;
  showArea: boolean;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  labelOffsets?: LabelOffsets;
};

export type SliderObject = {
  id: string;
  type: "slider";
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  showOnCanvas?: boolean;
  hidden?: boolean;
  labelOffsets?: LabelOffsets;
};

export type TextObject = {
  id: string;
  type: "text";
  name: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  color: string;
  hidden?: boolean;
  labelOffsets?: LabelOffsets;
};

export type MathObject =
  | PointObject
  | SegmentObject
  | FunctionObject
  | AngleObject
  | PolygonObject
  | CircleObject
  | SliderObject
  | TextObject;

export type Tool =
  | "select"
  | "pan"
  | "point"
  | "segment"
  | "line"
  | "angle"
  | "polygon"
  | "circle"
  | "circleRadius"
  | "circleThree"
  | "midpoint"
  | "parallel"
  | "perpendicular"
  | "perpendicularBisector"
  | "median"
  | "angleBisector"
  | "intersection"
  | "text";

export type Viewport = { centerX: number; centerY: number; scale: number };

export const COLORS = [
  "#0f766e",
  "#2563eb",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#111827",
  "#0891b2",
  "#16a34a",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
  "#9333ea",
  "#65a30d",
  "#c2410c",
  "#475569",
  "#000000",
];

export const round = (n: number, digits = 2) => Number(n.toFixed(digits));
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const slope = (a: Point, b: Point) =>
  b.x === a.x ? Infinity : (b.y - a.y) / (b.x - a.x);
export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
export const polygonArea = (points: Point[]) =>
  Math.abs(
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length];
      return sum + p.x * next.y - next.x * p.y;
    }, 0),
  ) / 2;
export const polygonPerimeter = (points: Point[]) =>
  points.reduce(
    (sum, p, i) => sum + distance(p, points[(i + 1) % points.length]),
    0,
  );
export const angleDegrees = (a: Point, vertex: Point, c: Point) => {
  const first = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const second = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  let value = Math.abs(((second - first) * 180) / Math.PI) % 360;
  if (value > 180) value = 360 - value;
  return value;
};
export const nextPointName = (objects: MathObject[]) => {
  const used = new Set(
    objects.filter((o) => o.type === "point").map((o) => o.name.toUpperCase()),
  );
  for (let index = 0; index < 26; index += 1) {
    const candidate = String.fromCharCode(65 + index);
    if (!used.has(candidate)) return candidate;
  }
  let suffix = 2;
  while (used.has(`A${suffix}`)) suffix += 1;
  return `A${suffix}`;
};
export const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `obj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
