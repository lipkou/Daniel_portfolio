/** Executes a flowchart model one block at a time. Pure functions — easy to test. */
import { evaluate, evaluateNumber, ExprError } from "./expr";
import type { FlowEdge, FlowModel, FlowNode, InputSpec, Value } from "./types";

export interface LogLine {
  kind: "input" | "output" | "info" | "error";
  text: string;
}

/** A suspended caller while a subroutine runs. */
export interface Frame {
  callNode: string;
  vars: Record<string, Value>;
  result: string;
  returns: string;
  /** e.g. "F(t, a)" — for the UI */
  label: string;
}

export interface SimState {
  vars: Record<string, Value>;
  /** call stack: innermost caller last */
  stack: Frame[];
  current: string;
  log: LogLine[];
  /** loop node id → loop currently active */
  loops: Record<string, boolean>;
  steps: number;
  done: boolean;
  error?: string;
}

export interface StepResult {
  state: SimState;
  /** index into model.edges that is taken next, or null when finished / jumped */
  edge: number | null;
  /** true when control jumped without an edge (subroutine call) */
  jump?: boolean;
}

export const MAX_DEPTH = 50;

export const MAX_STEPS = 2000;

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "-": "₋",
};
export const subscript = (n: number | string) => [...String(n)].map((c) => SUB[c] ?? c).join("");

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toString().replace("-", "−");
  const abs = Math.abs(v);
  const s = abs !== 0 && (abs < 1e-4 || abs >= 1e9) ? v.toExponential(4) : String(Number(v.toPrecision(6)));
  return s.replace(".", ",").replace("-", "−");
}

export function formatValue(v: Value): string {
  if (typeof v === "string") return `'${v}' (код ${v.codePointAt(0)})`;
  if (Array.isArray(v)) {
    const head = v.slice(0, 6).map(formatNumber).join("; ");
    return `[${head}${v.length > 6 ? "; …" : ""}] (${v.length} ел.)`;
  }
  return formatNumber(v);
}

/** Human label for a variable or an indexed element (`y[i]` → `y₇`). */
export function displayName(model: FlowModel, target: string, vars: Record<string, Value>): string {
  const m = /^(\w+)\[(.+)\]$/.exec(target);
  if (m) {
    const base = model.symbols?.[m[1]] ?? m[1];
    return base + subscript(evaluateNumber(m[2], vars));
  }
  return model.symbols?.[target] ?? target;
}

export function initialState(model: FlowModel): SimState {
  const start = model.nodes.find((n) => n.type === "start");
  if (!start) throw new Error("model has no start node");
  return { vars: {}, stack: [], current: start.id, log: [], loops: {}, steps: 0, done: false };
}

function outgoing(model: FlowModel, nodeId: string): [number, FlowEdge][] {
  return model.edges.map((e, i) => [i, e] as [number, FlowEdge]).filter(([, e]) => e.from === nodeId);
}

function pick(model: FlowModel, node: FlowNode, when?: string): number {
  const found = outgoing(model, node.id).find(([, e]) => (when ? e.when === when : !e.when));
  if (!found) throw new Error(`no ${when ?? "default"} edge from ${node.id}`);
  return found[0];
}

function assignTo(vars: Record<string, Value>, target: string, value: Value) {
  const m = /^(\w+)\[(.+)\]$/.exec(target);
  if (!m) {
    vars[target] = value;
    return;
  }
  const idx = evaluateNumber(m[2], vars);
  const arr = Array.isArray(vars[m[1]]) ? [...(vars[m[1]] as number[])] : [];
  if (typeof value !== "number") throw new ExprError("Елементом масиву може бути лише число");
  arr[idx - 1] = value;
  vars[m[1]] = arr;
}

/** Execute the current block and decide which edge to follow. */
export function step(model: FlowModel, prev: SimState, inputs: Record<string, Value>): StepResult {
  if (prev.done) return { state: prev, edge: null };
  const node = model.nodes.find((n) => n.id === prev.current)!;
  const state: SimState = {
    ...prev,
    vars: { ...prev.vars },
    stack: [...prev.stack],
    log: [...prev.log],
    loops: { ...prev.loops },
    steps: prev.steps + 1,
  };
  const name = (t: string) => displayName(model, t, state.vars);

  if (state.steps > MAX_STEPS) {
    return { state: { ...state, done: true, error: `Перевищено ${MAX_STEPS} кроків` }, edge: null };
  }

  try {
    switch (node.type) {
      case "start":
      case "entry":
        return { state, edge: pick(model, node) };

      case "call": {
        const spec = node.call!;
        if (state.stack.length >= MAX_DEPTH) throw new ExprError(`Глибина викликів понад ${MAX_DEPTH}`);
        const params: Record<string, Value> = {};
        for (const [param, arg] of spec.args) params[param] = evaluate(arg, state.vars);
        const entry = model.nodes.find((n) => n.id === spec.entry)!;
        const label = entry.text.replace(/^Вхід\s*/, "");
        state.stack.push({ callNode: node.id, vars: state.vars, result: spec.result, returns: spec.returns, label });
        state.vars = params;
        const shown = spec.args.map(([p]) => `${name(p)} = ${formatValue(params[p])}`).join("; ");
        state.log.push({ kind: "info", text: `→ виклик ${label}: ${shown}` });
        return { state: { ...state, current: entry.id }, edge: null, jump: true };
      }

      case "return": {
        const frame = state.stack.pop();
        if (!frame) throw new ExprError("«Вихід» без виклику підпрограми");
        if (!(frame.returns in state.vars)) throw new ExprError(`Підпрограма не обчислила ${frame.returns}`);
        const value = state.vars[frame.returns];
        state.vars = frame.vars;
        assignTo(state.vars, frame.result, value);
        state.log.push({ kind: "info", text: `← повернення: ${name(frame.result)} = ${formatValue(value)}` });
        const caller = model.nodes.find((n) => n.id === frame.callNode)!;
        return { state: { ...state, current: caller.id }, edge: pick(model, caller) };
      }

      case "end":
        state.log.push({ kind: "info", text: "Кінець алгоритму" });
        return { state: { ...state, done: true }, edge: null };

      case "io":
        for (const v of node.input ?? []) {
          if (!(v in inputs)) throw new ExprError(`Не задано вхідне значення ${v}`);
          state.vars[v] = inputs[v];
          state.log.push({ kind: "input", text: `${name(v)} = ${formatValue(inputs[v])}` });
        }
        for (const expr of node.print ?? []) {
          const v = evaluate(expr, state.vars);
          const ctype = model.ctypes?.[expr];
          let text = `${name(expr)} = ${formatValue(v)}`;
          if (ctype) text = `${ctype.padEnd(8)} ${text}`;
          if (ctype === "float" && typeof v === "number") text += `  (у пам'яті ${v.toFixed(10).replace(".", ",")})`;
          state.log.push({ kind: "output", text });
        }
        for (const line of node.message?.split("\n") ?? []) state.log.push({ kind: "output", text: line });
        return { state, edge: pick(model, node) };

      case "process":
        for (const [target, expr] of node.assign ?? []) {
          assignTo(state.vars, target, evaluate(expr, state.vars));
        }
        return { state, edge: pick(model, node) };

      case "decision": {
        const ok = evaluateNumber(node.cond!, state.vars) !== 0;
        return { state, edge: pick(model, node, ok ? "yes" : "no") };
      }

      case "loop": {
        const spec = node.loop!;
        if (!state.loops[node.id]) {
          state.vars[spec.var] = evaluateNumber(spec.from, state.vars);
          state.loops[node.id] = true;
        } else {
          state.vars[spec.var] = evaluateNumber(spec.var, state.vars) + evaluateNumber(spec.step, state.vars);
        }
        if (evaluateNumber(spec.var, state.vars) <= evaluateNumber(spec.to, state.vars)) {
          return { state, edge: pick(model, node, "body") };
        }
        state.loops[node.id] = false;
        return { state, edge: pick(model, node, "exit") };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.log.push({ kind: "error", text: `Помилка: ${msg}` });
    return { state: { ...state, done: true, error: msg }, edge: null };
  }
}

/** Follow an edge: move the "instruction pointer" to its target. */
export function follow(model: FlowModel, state: SimState, edge: number): SimState {
  return { ...state, current: model.edges[edge].to };
}

/** Run to completion (used by tests and for the "instant" mode). */
export function runAll(model: FlowModel, inputs: Record<string, Value>) {
  let state = initialState(model);
  const visited: string[] = [];
  for (;;) {
    visited.push(state.current);
    const r = step(model, state, inputs);
    state = r.state;
    if (r.jump) continue;
    if (r.edge === null) return { state, visited };
    state = follow(model, state, r.edge);
  }
}

export function defaultInputs(specs: InputSpec[]): Record<string, Value> {
  return Object.fromEntries(specs.map((s) => [s.name, resolveInput(s, s.default)]));
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const UINT_MAX = 4294967295;

function toNumber(value: number | string): number {
  const s = String(value).trim().replace(",", ".");
  if (s === "") throw new Error("Введіть число");
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error("Це не число");
  return n;
}

/** Turn a raw form value into a typed value; throws a human-readable error if invalid. */
export function resolveInput(spec: InputSpec, value: number | string): Value {
  switch (spec.kind) {
    case "number":
    case "double":
      return toNumber(value);
    case "float":
      return Math.fround(toNumber(value)); // 32-bit, like C's float
    case "int": {
      const n = toNumber(value);
      if (!Number.isInteger(n)) throw new Error("int — лише ціле число");
      if (n < INT_MIN || n > INT_MAX) throw new Error(`int: від ${INT_MIN} до ${INT_MAX}`);
      return n;
    }
    case "uint": {
      const n = toNumber(value);
      if (!Number.isInteger(n) || n < 0) throw new Error("unsigned — ціле ≥ 0");
      if (n > UINT_MAX) throw new Error(`unsigned: до ${UINT_MAX}`);
      return n;
    }
    case "char": {
      const chars = [...String(value)];
      if (chars.length !== 1) throw new Error("char — рівно один символ");
      return chars[0];
    }
    case "array":
      break;
  }
  const n = spec.length ?? 10;
  if (value === "range") return Array.from({ length: n }, (_, i) => i + 1);
  if (value === "zeros") return Array(n).fill(0);
  if (value === "random") return Array.from({ length: n }, () => Math.round((Math.random() * 20 - 10) * 10) / 10);
  return parseArray(String(value), n);
}

export function parseArray(text: string, length: number): number[] {
  const parts = text.split(/[;\s]+/).map((p) => p.replace(",", ".")).filter(Boolean).map(Number);
  if (parts.some((p) => Number.isNaN(p))) throw new Error("У масиві є не числа");
  if (parts.length !== length) throw new Error(`Потрібно рівно ${length} чисел, а задано ${parts.length}`);
  return parts;
}
