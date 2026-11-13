import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasSize, CW, edgePx, nodeBox, RH, type Point } from "./geometry";
import {
  follow,
  formatValue,
  initialState,
  resolveInput,
  step,
  type SimState,
} from "./interpreter";
import type { FlowModel, FlowNode, InputSpec, Value } from "./types";

type Phase = "ready" | "node" | "edge" | "done";

const SPEEDS = [
  { label: "0.5×", ms: 1400 },
  { label: "1×", ms: 750 },
  { label: "2×", ms: 380 },
  { label: "4×", ms: 160 },
];

// ---------------------------------------------------------------------------

function Shape({ node, cls, visits }: { node: FlowNode; cls: string; visits: number }) {
  const b = nodeBox(node);
  const h = b.y1 - b.y0;
  let shape: JSX.Element;
  switch (node.type) {
    case "start":
    case "end":
    case "entry":
    case "return":
      shape = <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={h} rx={h / 2} />;
      break;
    case "call": {
      const s = CW * 0.9;
      shape = (
        <path
          d={`M${b.x0},${b.y0} H${b.x1} V${b.y1} H${b.x0} Z M${b.x0 + s},${b.y0} V${b.y1} M${b.x1 - s},${b.y0} V${b.y1}`}
        />
      );
      break;
    }
    case "process":
      shape = <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={h} rx={3} />;
      break;
    case "io": {
      const s = CW * 1.6;
      shape = <polygon points={`${b.x0 + s},${b.y0} ${b.x1},${b.y0} ${b.x1 - s},${b.y1} ${b.x0},${b.y1}`} />;
      break;
    }
    case "decision":
      shape = <polygon points={`${b.x0},${b.cy} ${b.cx},${b.y0 - 6} ${b.x1},${b.cy} ${b.cx},${b.y1 + 6}`} />;
      break;
    case "loop": {
      const s = CW * 1.4;
      shape = (
        <polygon
          points={`${b.x0},${b.cy} ${b.x0 + s},${b.y0} ${b.x1 - s},${b.y0} ${b.x1},${b.cy} ${b.x1 - s},${b.y1} ${b.x0 + s},${b.y1}`}
        />
      );
      break;
    }
  }
  return (
    <g className={`fc-node fc-${node.type} ${cls}`}>
      {shape}
      <text x={b.cx} y={b.cy} dominantBaseline="central" textAnchor="middle">
        {node.text}
      </text>
      {visits > 0 && (
        <text className="fc-visits" x={b.x0 - 6} y={b.y0 + 2} dominantBaseline="hanging" textAnchor="end">
          ×{visits}
        </text>
      )}
    </g>
  );
}

/** Text shown in the form field for a default / preset value. */
function rawFor(spec: InputSpec, value: number | string): string {
  if (spec.kind !== "array") return String(value);
  return (resolveInput(spec, value) as number[]).join("; ");
}

const TYPE_HINT: Partial<Record<InputSpec["kind"], string>> = {
  int: "int",
  uint: "unsigned",
  float: "float",
  double: "double",
  char: "char",
};

/** Ukrainian plural: 1 крок, 3 кроки, 7 кроків, 21 крок, 12 кроків. */
function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const toPath = (pts: Point[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");

// ---------------------------------------------------------------------------

export function FlowchartPlayer({ model, id }: { model: FlowModel; id: string }) {
  const size = useMemo(() => canvasSize(model), [model]);
  const paths = useMemo(() => model.edges.map((e) => edgePx(model, e)), [model]);

  // --- inputs ---
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(model.inputs.map((s) => [s.name, rawFor(s, s.default)])),
  );
  const parsed = useMemo(() => {
    const values: Record<string, Value> = {};
    const errors: Record<string, string> = {};
    for (const spec of model.inputs) {
      try {
        values[spec.name] = resolveInput(spec, raw[spec.name]);
      } catch (e) {
        errors[spec.name] = e instanceof Error ? e.message : String(e);
      }
    }
    return { values, errors, ok: Object.keys(errors).length === 0 };
  }, [raw, model.inputs]);

  const applyPreset = (values: Record<string, number | string>) => {
    setRaw((r) => {
      const next = { ...r };
      for (const spec of model.inputs) {
        if (spec.name in values) next[spec.name] = rawFor(spec, values[spec.name]);
      }
      return next;
    });
  };

  // --- simulation ---
  const [sim, setSim] = useState<SimState>(() => initialState(model));
  const [phase, setPhase] = useState<Phase>("ready");
  const [playing, setPlaying] = useState(false);
  const [edge, setEdge] = useState<number | null>(null);
  const [token, setToken] = useState<Point | null>(null);
  const [speed, setSpeed] = useState(1);
  /** visits in the current run — drives the blue highlight and ×N badges */
  const [visits, setVisits] = useState<Record<string, number>>({});
  /** blocks executed in any run since the last reset — drives coverage / dashed "cold" blocks */
  const [everVisited, setEverVisited] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState(0);
  const [traversed, setTraversed] = useState<Set<number>>(new Set());
  const stopAfterEdge = useRef(false);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const inputsRef = useRef(parsed.values);
  inputsRef.current = parsed.values;
  const logRef = useRef<HTMLOListElement>(null);

  const ms = SPEEDS[speed].ms;

  const reset = useCallback(() => {
    setPlaying(false);
    setSim(initialState(model));
    setPhase("ready");
    setEdge(null);
    setToken(null);
    setTraversed(new Set());
    setVisits({});
    setEverVisited(new Set());
    setRuns(0);
  }, [model]);

  const begin = (stepMode: boolean) => {
    if (!parsed.ok) return;
    stopAfterEdge.current = stepMode;
    if (phase === "ready" || phase === "done") {
      setSim(initialState(model));
      setTraversed(new Set());
      setVisits({}); // new run → fresh highlight; coverage (everVisited) is kept
      setToken(null);
      setEdge(null);
      setPhase("node");
      setRuns((r) => r + 1);
    }
    setPlaying(true);
  };

  // execute the highlighted block
  useEffect(() => {
    if (!playing || phase !== "node") return;
    const t = setTimeout(() => {
      const r = step(model, sim, inputsRef.current);
      setVisits((v) => ({ ...v, [sim.current]: (v[sim.current] ?? 0) + 1 }));
      setEverVisited((s) => (s.has(sim.current) ? s : new Set(s).add(sim.current)));
      setSim(r.state);
      if (r.jump) {
        // control moved into a subroutine — highlight its entry next, no edge to animate
        setToken(null);
        if (stopAfterEdge.current) setPlaying(false);
        return;
      }
      if (r.edge === null) {
        setPhase("done");
        setPlaying(false);
        return;
      }
      setEdge(r.edge);
      setPhase("edge");
    }, ms * 0.55);
    return () => clearTimeout(t);
  }, [playing, phase, sim, model, ms]);

  // move the token along the chosen edge
  useEffect(() => {
    if (!playing || phase !== "edge" || edge === null) return;
    const path = pathRefs.current[edge];
    if (!path) return;
    const len = path.getTotalLength();
    const started = performance.now();
    const duration = Math.max(120, Math.min(ms, len * (ms / 140)));
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - started) / duration);
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = path.getPointAtLength(len * eased);
      setToken([p.x, p.y]);
      if (k < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setTraversed((s) => new Set(s).add(edge));
      setSim((s) => follow(model, s, edge));
      setEdge(null);
      setPhase("node");
      if (stopAfterEdge.current) setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, phase, edge, model, ms]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sim.log.length]);

  // --- derived view state ---
  const current = phase === "ready" ? null : sim.current;
  const visitedCount = model.nodes.filter((n) => everVisited.has(n.id)).length;
  const cold = runs > 0 && phase !== "node" && phase !== "edge";
  const scalarVars = Object.entries(sim.vars);
  const label = (name: string) => model.symbols?.[name] ?? name;

  const nodeClass = (n: FlowNode) => {
    const c: string[] = [];
    if (n.id === current) c.push(sim.error ? "is-error" : phase === "done" ? "is-done" : "is-active");
    else if (visits[n.id]) c.push("is-visited");
    else if (cold && !everVisited.has(n.id)) c.push("is-cold");
    return c.join(" ");
  };

  const status =
    phase === "ready"
      ? "Готово до запуску"
      : sim.error
        ? `Зупинено: ${sim.error}`
        : phase === "done"
          ? `Виконано за ${sim.steps} ${plural(sim.steps, "крок", "кроки", "кроків")}`
          : playing
            ? `Виконується… крок ${sim.steps + 1}`
            : `Пауза · крок ${sim.steps}`;

  return (
    <div className="player">
      <div className="player-controls">
        <fieldset className="inputs" disabled={playing}>
          <legend>Вхідні дані</legend>
          {model.inputs.length === 0 && <p className="muted small no-inputs">не потрібні — просто запустіть</p>}
          {model.inputs.map((spec) => (
            <label key={spec.name} className={spec.kind === "array" ? "input-array" : "input-number"}>
              <span>
                {spec.label}
                {TYPE_HINT[spec.kind] && <small className="type-hint"> {TYPE_HINT[spec.kind]}</small>}
              </span>
              {spec.kind === "array" ? (
                <textarea
                  rows={3}
                  value={raw[spec.name]}
                  onChange={(e) => setRaw({ ...raw, [spec.name]: e.target.value })}
                  aria-invalid={!!parsed.errors[spec.name]}
                />
              ) : (
                <input
                  inputMode="decimal"
                  value={raw[spec.name]}
                  onChange={(e) => setRaw({ ...raw, [spec.name]: e.target.value })}
                  aria-invalid={!!parsed.errors[spec.name]}
                />
              )}
              {parsed.errors[spec.name] && <em className="input-error">{parsed.errors[spec.name]}</em>}
            </label>
          ))}
          {model.presets && model.presets.length > 0 && (
            <div className="presets">
              {model.presets.map((p) => (
                <button key={p.label} type="button" className="chip" onClick={() => applyPreset(p.values)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <div className="buttons">
          {playing ? (
            <button className="btn primary" onClick={() => setPlaying(false)}>
              ❚❚ Пауза
            </button>
          ) : (
            <button className="btn primary" onClick={() => begin(false)} disabled={!parsed.ok}>
              ▶ {phase === "ready" || phase === "done" ? "Запустити" : "Продовжити"}
            </button>
          )}
          <button className="btn" onClick={() => begin(true)} disabled={playing || !parsed.ok}>
            ⏭ Крок
          </button>
          <button className="btn" onClick={reset} disabled={phase === "ready"}>
            ↺ Скинути
          </button>
          <div className="speed" role="group" aria-label="Швидкість">
            {SPEEDS.map((s, i) => (
              <button key={s.label} className={`chip ${i === speed ? "on" : ""}`} onClick={() => setSpeed(i)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <p className={`status ${sim.error ? "bad" : phase === "done" ? "good" : ""}`} aria-live="polite">
          {status}
        </p>
      </div>

      <div className="player-body">
        <div className="canvas-wrap">
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            width={size.width}
            className="flowchart"
            role="img"
            aria-label="Блок-схема алгоритму"
          >
            <defs>
              <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" className="fc-arrow" />
              </marker>
              <marker id={`arrow-on-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" className="fc-arrow on" />
              </marker>
            </defs>
            {model.edges.map((e, i) => {
              const on = i === edge;
              const pts = paths[i];
              const [sx, sy] = pts[0];
              const vertical = pts[1][0] === sx;
              return (
                <g key={i} className={`fc-edge ${on ? "on" : traversed.has(i) ? "done" : ""}`}>
                  <path
                    ref={(el) => (pathRefs.current[i] = el)}
                    d={toPath(pts)}
                    markerEnd={`url(#${on ? "arrow-on-" : "arrow-"}${id})`}
                  />
                  {e.label && (
                    <text x={vertical ? sx + 8 : sx + 10} y={vertical ? sy + RH * 0.7 : sy - 7} className="fc-label">
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {model.nodes.map((n) => (
              <Shape key={n.id} node={n} cls={nodeClass(n)} visits={visits[n.id] ?? 0} />
            ))}
            {token && <circle className="fc-token" cx={token[0]} cy={token[1]} r={6} />}
          </svg>
        </div>

        <aside className="state">
          <section>
            <h4>
              Змінні
              {sim.stack.length > 0 && (
                <span className="frame-tag"> · всередині {sim.stack[sim.stack.length - 1].label}</span>
              )}
            </h4>
            {scalarVars.length === 0 ? (
              <p className="muted">поки порожньо</p>
            ) : (
              <dl className="vars">
                {scalarVars.map(([k, v]) => (
                  <div key={k}>
                    <dt>{label(k)}</dt>
                    <dd>{formatValue(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section>
            <h4>Вивід</h4>
            <ol className="log" ref={logRef}>
              {sim.log.map((l, i) => (
                <li key={i} className={`log-${l.kind}`}>
                  {l.kind === "input" ? "⇢ " : l.kind === "output" ? "⇠ " : ""}
                  {l.text}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h4>Покриття</h4>
            <p className="coverage">
              {visitedCount} / {model.nodes.length} блоків виконувались
              {runs > 1 && ` за ${runs} ${plural(runs, "запуск", "запуски", "запусків")}`}
              {runs > 0 && visitedCount < model.nodes.length && (
                <span className="muted"> · пунктиром — ще жодного разу</span>
              )}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
