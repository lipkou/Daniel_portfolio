/**
 * A tiny, safe expression language for flowchart blocks — no `eval`.
 *
 *   numbers, variables, x[i] (1-based arrays), + - * / ^ (right-assoc),
 *   == != < <= > >=, and / or / not, ( ), sin cos tan exp ln lg sqrt abs
 */
import type { Value } from "./types";

export class ExprError extends Error {}

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  ln: Math.log,
  lg: Math.log10,
  // −1e-9 < x < 0 is rounding noise (e.g. Heron's formula for a degenerate triangle)
  sqrt: (x) => (x < 0 && x > -1e-9 ? 0 : Math.sqrt(x)),
  abs: Math.abs,
};

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(src.slice(i));
      if (!m) throw new ExprError(`Погане число біля «${src.slice(i, i + 5)}»`);
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (["==", "!=", "<=", ">="].includes(two)) {
        out.push({ t: "op", v: two });
        i += 2;
      } else if ("+-*/^()[]<>,".includes(ch)) {
        out.push({ t: "op", v: ch });
        i++;
      } else {
        throw new ExprError(`Невідомий символ «${ch}»`);
      }
    }
  }
  return out;
}

export type Scope = Record<string, Value>;

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private scope: Scope) {}

  parse(): Value {
    const v = this.or();
    if (this.pos < this.tokens.length) throw new ExprError("Зайві символи у виразі");
    return v;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private isOp(v: string) {
    const t = this.peek();
    return !!t && t.t === "op" && t.v === v;
  }
  private isWord(v: string) {
    const t = this.peek();
    return !!t && t.t === "id" && t.v === v;
  }
  private expect(v: string) {
    if (!this.isOp(v)) throw new ExprError(`Очікувалось «${v}»`);
    this.pos++;
  }
  private num(v: Value): number {
    if (typeof v !== "number") throw new ExprError("Очікувалось число, а не масив");
    return v;
  }

  private or(): Value {
    let v = this.and();
    while (this.isWord("or")) {
      this.pos++;
      const r = this.and();
      v = this.num(v) || this.num(r) ? 1 : 0;
    }
    return v;
  }
  private and(): Value {
    let v = this.cmp();
    while (this.isWord("and")) {
      this.pos++;
      const r = this.cmp();
      v = this.num(v) && this.num(r) ? 1 : 0;
    }
    return v;
  }
  private cmp(): Value {
    const l = this.add();
    const t = this.peek();
    if (t && t.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) {
      this.pos++;
      const a = this.num(l);
      const b = this.num(this.add());
      const res = { "==": a === b, "!=": a !== b, "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b }[t.v];
      return res ? 1 : 0;
    }
    return l;
  }
  private add(): Value {
    let v = this.mul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.num(this.mul());
      v = op === "+" ? this.num(v) + r : this.num(v) - r;
    }
    return v;
  }
  private mul(): Value {
    let v = this.unary();
    while (this.isOp("*") || this.isOp("/")) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.num(this.unary());
      // |r| < 1e-12 also counts: m·α₁ − α₂² is never *exactly* 0 in floating point.
      if (op === "/" && Math.abs(r) < 1e-12) throw new ExprError("Ділення на нуль");
      v = op === "*" ? this.num(v) * r : this.num(v) / r;
    }
    return v;
  }
  private unary(): Value {
    if (this.isOp("-")) {
      this.pos++;
      return -this.num(this.unary());
    }
    if (this.isWord("not")) {
      this.pos++;
      return this.num(this.unary()) ? 0 : 1;
    }
    return this.pow();
  }
  private pow(): Value {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.pos++;
      return Math.pow(this.num(base), this.num(this.unary()));
    }
    return base;
  }
  private postfix(): Value {
    let v = this.primary();
    while (this.isOp("[")) {
      this.pos++;
      const idx = this.num(this.or());
      this.expect("]");
      if (!Array.isArray(v)) throw new ExprError("Індексувати можна лише масив");
      if (!Number.isInteger(idx) || idx < 1 || idx > v.length) {
        throw new ExprError(`Індекс ${idx} поза межами 1…${v.length}`);
      }
      v = v[idx - 1];
    }
    return v;
  }
  private primary(): Value {
    const t = this.tokens[this.pos++];
    if (!t) throw new ExprError("Неочікуваний кінець виразу");
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") {
      const v = this.or();
      this.expect(")");
      return v;
    }
    if (t.t === "id") {
      if (this.isOp("(")) {
        const fn = FUNCS[t.v];
        if (!fn) throw new ExprError(`Невідома функція ${t.v}`);
        this.pos++;
        const arg = this.num(this.or());
        this.expect(")");
        const r = fn(arg);
        if (!Number.isFinite(r)) throw new ExprError(`${t.v}(${arg}) не визначено`);
        return r;
      }
      if (!(t.v in this.scope)) throw new ExprError(`Змінна ${t.v} ще не має значення`);
      return this.scope[t.v];
    }
    throw new ExprError(`Неочікуване «${t.v}»`);
  }
}

export function evaluate(src: string, scope: Scope): Value {
  return new Parser(tokenize(src), scope).parse();
}

export function evaluateNumber(src: string, scope: Scope): number {
  const v = evaluate(src, scope);
  if (typeof v !== "number") throw new ExprError("Очікувалось число");
  return v;
}
