import { describe, expect, it } from "vitest";
import lab1 from "../../../backend/reports/content/lab-1.json";
import lab2 from "../../../backend/reports/content/lab-2.json";
import practice1 from "../../../backend/reports/content/practice-1.json";
import { evaluate, ExprError } from "./expr";
import { edgeCells } from "./geometry";
import { formatNumber, parseArray, resolveInput, runAll } from "./interpreter";
import type { FlowModel } from "./types";

const [linear, branching, cyclic, subroutine] = lab1.tasks.map((t) => t.model as unknown as FlowModel);

describe("lab-1 task 4 (control task, subroutine)", () => {
  const F = (t: number, a: number) => Math.tan(1 - a * t) ** 2;

  it("control data: x < 3y → z = F(y, a)", () => {
    const { state, visited } = runAll(subroutine, { x: 1.5, y: 2.5, a: 0.3 });
    expect(state.vars.z).toBeCloseTo(F(2.5, 0.3), 12);
    expect(visited).toContain("cy");
    expect(visited).not.toContain("cx");
    expect(visited).toContain("f_body");
  });
  it("x ≥ 3y → z = F(x, a)", () => {
    const { state, visited } = runAll(subroutine, { x: 9, y: 2, a: 0.3 });
    expect(state.vars.z).toBeCloseTo(F(9, 0.3), 12);
    expect(visited).toContain("cx");
  });
  it("subroutine locals do not leak into the main program", () => {
    const { state } = runAll(subroutine, { x: 1.5, y: 2.5, a: 0.3 });
    expect(state.stack).toHaveLength(0);
    expect(Object.keys(state.vars).sort()).toEqual(["a", "x", "y", "z"]);
    expect(state.log.some((l) => l.text.startsWith("→ виклик F(t, a)"))).toBe(true);
  });
});

describe("expr", () => {
  it("respects precedence and right-assoc power", () => {
    expect(evaluate("2 + 3 * 4", {})).toBe(14);
    expect(evaluate("2 ^ 3 ^ 2", {})).toBe(512);
    expect(evaluate("-2 ^ 2", {})).toBe(-4);
    expect(evaluate("(1 + 2) * (3 - 1) / 2", {})).toBe(3);
  });
  it("supports functions, comparisons and logic", () => {
    expect(evaluate("ln(exp(2))", {})).toBeCloseTo(2);
    expect(evaluate("lg(1000)", {})).toBeCloseTo(3);
    expect(evaluate("A == C and x == A", { A: 3, C: 3, x: 3 })).toBe(1);
    expect(evaluate("A != C or not 1", { A: 3, C: 3 })).toBe(0);
  });
  it("indexes arrays 1-based", () => {
    expect(evaluate("x[i] * 2", { x: [5, 6, 7], i: 3 })).toBe(14);
    expect(() => evaluate("x[4]", { x: [1, 2, 3] })).toThrow(ExprError);
  });
  it("reports errors instead of returning garbage", () => {
    expect(() => evaluate("1 / 0", {})).toThrow("Ділення на нуль");
    expect(() => evaluate("q + 1", {})).toThrow("q");
    expect(() => evaluate("alert(1)", {})).toThrow("Невідома функція");
  });
});

describe("lab-1 task 1 (linear)", () => {
  it("computes A for m = 1", () => {
    const { state } = runAll(linear, { m: 1 });
    const a1 = Math.sin(0.18);
    const b1 = Math.exp(a1);
    const a2 = Math.log(0.05) + Math.exp(a1);
    const expected = (a1 * b1 - a2 * 1.7) / (1 * a1 - a2 ** 2);
    expect(state.vars.A).toBeCloseTo(expected, 10);
    expect(state.done && !state.error).toBe(true);
  });
  it("stops with an error when the denominator is zero", () => {
    const a2 = Math.log(0.05) + Math.exp(Math.sin(0.18));
    const { state } = runAll(linear, { m: a2 ** 2 / Math.sin(0.18) });
    expect(state.error).toBe("Ділення на нуль");
  });
});

describe("lab-1 task 2 (branching)", () => {
  it("A ≠ C → Y = x³ − A", () => {
    const { state, visited } = runAll(branching, { x: 2, A: 5, C: 1 });
    expect(state.vars.Y).toBe(3);
    expect(visited).toContain("y2");
  });
  it("A = C, x = A → first branch, Y = 0", () => {
    const { state, visited } = runAll(branching, { x: 3, A: 3, C: 3 });
    expect(state.vars.Y).toBe(0);
    expect(visited).toContain("y1");
  });
  it("A = C, x ≠ A → Y не визначено", () => {
    const { state } = runAll(branching, { x: 2, A: 3, C: 3 });
    expect(state.log.some((l) => l.text === "Y не визначено")).toBe(true);
  });
  it("third branch is unreachable for any input", () => {
    for (const [x, A, C] of [[1, 1, 1], [0, 0, 0], [2, 3, 3], [5, 1, 2], [-1, -1, -1]]) {
      expect(runAll(branching, { x, A, C }).visited).not.toContain("y3");
    }
  });
});

describe("lab-1 task 3 (cyclic)", () => {
  it("runs 25 iterations and outputs every y_i", () => {
    const x = Array.from({ length: 25 }, (_, i) => i + 1);
    const { state } = runAll(cyclic, { x });
    const y = state.vars.y as number[];
    expect(y).toHaveLength(25);
    expect(y[0]).toBeCloseTo((2.5 * 1 + 4 * 12.7 + 0.2) ** 3);
    expect(state.log.filter((l) => l.kind === "output")).toHaveLength(25);
    expect(state.log.find((l) => l.kind === "output")!.text).toMatch(/^y₁ = /);
  });
});

const [triangle, heron] = lab2.tasks.map((t) => t.model as unknown as FlowModel);
const practiceModels = practice1.tasks.map((t) => t.model as unknown as FlowModel);
const ALL = [linear, branching, cyclic, subroutine, triangle, heron, ...practiceModels];

describe("lab-2", () => {
  it("triangle check", () => {
    const says = (a: number, b: number, c: number) =>
      runAll(triangle, { a, b, c }).state.log.filter((l) => l.kind === "output").map((l) => l.text);
    expect(says(3, 4, 5)).toEqual(["Трикутник існує"]);
    expect(says(1, 2, 3)).toEqual(["Трикутник не існує"]);
    expect(says(1, 1, 5)).toEqual(["Трикутник не існує"]);
    expect(says(-3, 4, 5)).toEqual(["Трикутник не існує"]);
  });
  it("control example gives P = 12, S = 6", () => {
    const { state } = runAll(heron, { x1: 0, y1: 0, x2: 0, y2: 3, x3: 4, y3: 0 });
    expect(state.vars.P).toBeCloseTo(12);
    expect(state.vars.S).toBeCloseTo(6);
  });
  it("collinear points give S = 0 instead of NaN", () => {
    const { state } = runAll(heron, { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 2 });
    expect(state.error).toBeUndefined();
    expect(state.vars.S).toBeCloseTo(0);
  });
});

describe("practice-1", () => {
  it("prints the multi-line greeting", () => {
    const out = runAll(practiceModels[0], {}).state.log.filter((l) => l.kind === "output");
    expect(out.map((l) => l.text)).toEqual(["Привіт!", " Це моя перша програма на С++!"]);
  });
  it("shows how a float is really stored", () => {
    const spec = practiceModels[2].inputs;
    const inputs = Object.fromEntries(spec.map((s) => [s.name, resolveInput(s, s.default)]));
    const out = runAll(practiceModels[2], inputs).state.log.filter((l) => l.kind === "output").map((l) => l.text);
    expect(out.find((t) => t.startsWith("float"))).toContain("3,1400001049");
    expect(out.find((t) => t.startsWith("char"))).toContain("код 65");
  });
  it("validates C types", () => {
    const [c, i, u] = practiceModels[2].inputs;
    expect(() => resolveInput(u, -1)).toThrow("≥ 0");
    expect(() => resolveInput(i, 2.5)).toThrow("ціле");
    expect(() => resolveInput(i, 2147483648)).toThrow("int");
    expect(() => resolveInput(c, "AB")).toThrow("один символ");
  });
});

describe("geometry", () => {
  it("every edge is made of horizontal / vertical segments", () => {
    for (const model of ALL) {
      for (const e of model.edges) {
        const cells = edgeCells(model, e);
        for (let i = 1; i < cells.length; i++) {
          const [a, b] = [cells[i - 1], cells[i]];
          expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
        }
      }
    }
  });
});

describe("helpers", () => {
  it("formats numbers the Ukrainian way", () => {
    expect(formatNumber(-1.06994)).toBe("−1,06994");
    expect(formatNumber(140608)).toBe("140608");
  });
  it("parses arrays with comma decimals", () => {
    expect(parseArray("1; 2,5 3", 3)).toEqual([1, 2.5, 3]);
    expect(() => parseArray("1 2", 3)).toThrow("рівно 3");
  });
});
