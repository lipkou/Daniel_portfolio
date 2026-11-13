/**
 * Flowchart geometry in character cells — a mirror of backend/reports/flowchart.py.
 * The same numbers produce the ASCII model in the API and the SVG on the site.
 */
import type { FlowEdge, FlowModel, FlowNode, Side } from "./types";

export type Point = [number, number];

export const textLen = (s: string) => [...s].length;

export function shapeWidth(node: FlowNode): number {
  return textLen(node.text) + (node.type === "io" ? 6 : 4);
}

export function bounds(node: FlowNode) {
  const width = shapeWidth(node);
  const left = node.x - Math.floor(width / 2);
  return { left, right: left + width - 1, top: node.y };
}

/** Cell just outside the shape where an edge attaches. */
export function port(node: FlowNode, side: Side): Point {
  const { left, right, top } = bounds(node);
  switch (side) {
    case "top":
      return [node.x, top - 1];
    case "bottom":
      return [node.x, top + 3];
    case "left":
      return [node.type === "io" ? left : left - 1, top + 1];
    case "right":
      return [right + 1, top + 1];
  }
}

/** Insert elbows so that every segment is horizontal or vertical. */
export function route(points: Point[], startSide: Side): Point[] {
  const out: Point[] = [points[0]];
  let vertical = startSide === "top" || startSide === "bottom";
  for (const target of points.slice(1)) {
    const cur = out[out.length - 1];
    if (cur[0] === target[0] && cur[1] === target[1]) continue;
    if (cur[0] !== target[0] && cur[1] !== target[1]) {
      out.push(vertical ? [cur[0], target[1]] : [target[0], cur[1]]);
      vertical = !vertical;
    } else {
      vertical = cur[0] === target[0];
    }
    out.push(target);
  }
  return out;
}

export function edgeCells(model: FlowModel, edge: FlowEdge): Point[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const fromSide = edge.from_side ?? "bottom";
  const toSide = edge.to_side ?? "top";
  const pts: Point[] = [port(byId.get(edge.from)!, fromSide), ...(edge.via ?? []), port(byId.get(edge.to)!, toSide)];
  return route(pts, fromSide);
}

// --- SVG projection ---------------------------------------------------------

export const CW = 9; // px per character column
export const RH = 18; // px per row
const INSET = 4; // vertical breathing room inside the 3-row band
/** Diamonds need extra width so the text fits inside the slanted sides. */
export const DIAMOND_EXTRA = 2;

export function nodeBox(node: FlowNode) {
  const b = bounds(node);
  const extra = node.type === "decision" ? DIAMOND_EXTRA * CW : 0;
  return {
    x0: b.left * CW - extra,
    x1: (b.right + 1) * CW + extra,
    y0: b.top * RH + INSET,
    y1: (b.top + 3) * RH - INSET,
    cx: node.x * CW + CW / 2,
    cy: (b.top + 1.5) * RH,
  };
}

function portPx(node: FlowNode, side: Side): Point {
  const box = nodeBox(node);
  const skew = node.type === "io" ? CW : 0; // parallelogram slant at mid-height
  switch (side) {
    case "top":
      return [box.cx, box.y0];
    case "bottom":
      return [box.cx, box.y1];
    case "left":
      return [box.x0 + skew, box.cy];
    case "right":
      return [box.x1 - skew, box.cy];
  }
}

const cellPx = ([x, y]: Point): Point => [x * CW + CW / 2, y * RH + RH / 2];

export function edgePx(model: FlowModel, edge: FlowEdge): Point[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const cells = edgeCells(model, edge);
  const pts = cells.map(cellPx);
  pts[0] = portPx(byId.get(edge.from)!, edge.from_side ?? "bottom");
  pts[pts.length - 1] = portPx(byId.get(edge.to)!, edge.to_side ?? "top");
  return pts;
}

export function canvasSize(model: FlowModel) {
  let w = 0;
  let h = 0;
  for (const n of model.nodes) {
    const box = nodeBox(n);
    w = Math.max(w, box.x1);
    h = Math.max(h, box.y1);
  }
  for (const e of model.edges) {
    for (const [x, y] of edgePx(model, e)) {
      w = Math.max(w, x);
      h = Math.max(h, y);
    }
  }
  return { width: w + CW * 2, height: h + RH };
}
