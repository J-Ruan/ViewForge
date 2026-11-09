export type Point = [number, number];
export type ViewKind = "front" | "top" | "side";
export type Role = "region" | "reference" | "hidden";
export interface Contour {
  id: string;
  points: Point[];
  closed: boolean;
  role: Role;
  selected: boolean;
}
export interface Drawing {
  kind: ViewKind;
  contours: Contour[];
  originalContours: Contour[];
  width: number;
  height: number;
  offset: Point;
  mirror: boolean;
  confirmed: boolean;
  sourceName?: string;
  sourceData?: string;
  warnings: string[];
}
export interface Feature {
  id: string;
  type: "circle" | "rectangle" | "groove" | "cut";
  axis: "x" | "y" | "z";
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  radius: number;
}
export interface Project {
  version: 1;
  name: string;
  unit: "mm" | "cm";
  projection: "first" | "third";
  side: "right" | "left";
  views: [Drawing, Drawing];
  features: Feature[];
  note: string;
}
export interface ProjectionCheck {
  kind: ViewKind;
  iou: number;
  input: Point[][];
  projected: Point[][];
  missing: Point[][];
  extra: Point[][];
}
export interface ModelResult {
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
  bounds: { min: number[]; max: number[] };
  checks: ProjectionCheck[];
  baseChecks: ProjectionCheck[];
  triangles: number;
}
export const labels: Record<ViewKind, string> = {
  front: "正视图",
  top: "俯视图",
  side: "侧视图",
};
export const uid = () => crypto.randomUUID();
