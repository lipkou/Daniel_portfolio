"""Flowchart model → ASCII block-scheme.

A model is a JSON dict:

    {
      "nodes": [{"id", "type", "text", "x", "y", ...semantics}],
      "edges": [{"from", "to", "from_side"?, "to_side"?, "via"?, "when"?, "label"?}]
    }

Coordinates are in *character cells*: ``x`` is the centre column of the shape,
``y`` its top row. Every shape is 3 rows tall. The frontend renders the very same
model as SVG using identical geometry (see ``frontend/src/flow/geometry.ts``), so
the text model in the API and the animated model on the site always match.
"""

from __future__ import annotations

Point = tuple[int, int]

NODE_TYPES = {"start", "end", "process", "io", "decision", "loop"}
SIDES = {"top", "bottom", "left", "right"}

LEGEND = (
    "╭───╮ початок / кінець    ┌───┐ обчислення    / ___ / введення / виведення\n"
    "<   > умова (так / ні)     <═══> заголовок циклу"
)


# --- geometry (keep in sync with frontend/src/flow/geometry.ts) -------------

def shape_width(node: dict) -> int:
    extra = 6 if node["type"] == "io" else 4
    return len(node["text"]) + extra


def bounds(node: dict) -> tuple[int, int, int]:
    """(left column, right column, top row) of the shape."""
    width = shape_width(node)
    left = node["x"] - width // 2
    return left, left + width - 1, node["y"]


def port(node: dict, side: str) -> Point:
    """Cell just outside the shape where an edge attaches."""
    left, right, top = bounds(node)
    if side == "top":
        return node["x"], top - 1
    if side == "bottom":
        return node["x"], top + 3
    if side == "left":
        return (left if node["type"] == "io" else left - 1), top + 1
    if side == "right":
        return right + 1, top + 1
    raise ValueError(f"unknown side {side!r}")


def route(points: list[Point], start_side: str) -> list[Point]:
    """Insert elbows so every segment is horizontal or vertical.

    Rule: keep going in the current direction first, then turn.
    """
    out = [points[0]]
    vertical = start_side in ("top", "bottom")
    for target in points[1:]:
        cur = out[-1]
        if cur == target:
            continue
        if cur[0] != target[0] and cur[1] != target[1]:
            out.append((cur[0], target[1]) if vertical else (target[0], cur[1]))
            vertical = not vertical
        else:
            vertical = cur[0] == target[0]
        out.append(target)
    return out


def edge_path(model: dict, edge: dict) -> list[Point]:
    nodes = {n["id"]: n for n in model["nodes"]}
    from_side = edge.get("from_side", "bottom")
    to_side = edge.get("to_side", "top")
    points = [port(nodes[edge["from"]], from_side)]
    points += [tuple(p) for p in edge.get("via", [])]
    points.append(port(nodes[edge["to"]], to_side))
    return route(points, from_side)


# --- shapes -----------------------------------------------------------------

def shape_rows(node: dict) -> list[str]:
    t = node["text"]
    n = len(t)
    kind = node["type"]
    if kind in ("start", "end"):
        return ["╭" + "─" * (n + 2) + "╮", "│ " + t + " │", "╰" + "─" * (n + 2) + "╯"]
    if kind == "process":
        return ["┌" + "─" * (n + 2) + "┐", "│ " + t + " │", "└" + "─" * (n + 2) + "┘"]
    if kind == "io":
        return ["  " + "_" * (n + 4), " / " + t + "  /", "/" + "_" * (n + 3) + "/"]
    if kind == "decision":
        return [" ╱" + "─" * n + "╲ ", "< " + t + " >", " ╲" + "─" * n + "╱ "]
    if kind == "loop":
        return [" ╱" + "═" * n + "╲ ", "< " + t + " >", " ╲" + "═" * n + "╱ "]
    raise ValueError(f"unknown node type {kind!r}")


# --- rendering --------------------------------------------------------------

_STEP = {"u": (0, -1), "d": (0, 1), "l": (-1, 0), "r": (1, 0)}
_OPPOSITE = {"u": "d", "d": "u", "l": "r", "r": "l"}
_TOWARD_SHAPE = {"bottom": "u", "top": "d", "left": "r", "right": "l"}
_ARROW = {"d": "▼", "u": "▲", "r": "►", "l": "◄"}
_JOINT = {
    frozenset("ud"): "│", frozenset("lr"): "─", frozenset("u"): "│", frozenset("d"): "│",
    frozenset("l"): "─", frozenset("r"): "─", frozenset("dr"): "┌", frozenset("dl"): "┐",
    frozenset("ur"): "└", frozenset("ul"): "┘", frozenset("udr"): "├", frozenset("udl"): "┤",
    frozenset("lrd"): "┬", frozenset("lru"): "┴", frozenset("udlr"): "┼",
}


def _direction(a: Point, b: Point) -> str:
    if a[0] == b[0]:
        return "d" if b[1] > a[1] else "u"
    return "r" if b[0] > a[0] else "l"


def render_ascii(model: dict) -> str:
    links: dict[Point, set[str]] = {}
    arrows: dict[Point, str] = {}
    labels: list[tuple[Point, str]] = []

    for edge in model["edges"]:
        path = edge_path(model, edge)
        links.setdefault(path[0], set()).add(_TOWARD_SHAPE[edge.get("from_side", "bottom")])
        last_dir = "d"
        for a, b in zip(path, path[1:]):
            d = _direction(a, b)
            dx, dy = _STEP[d]
            cell = a
            while cell != b:
                nxt = (cell[0] + dx, cell[1] + dy)
                links.setdefault(cell, set()).add(d)
                links.setdefault(nxt, set()).add(_OPPOSITE[d])
                cell = nxt
            last_dir = d
        arrows[path[-1]] = _ARROW[last_dir]

        if edge.get("label"):
            (sx, sy), first = path[0], _direction(path[0], path[1])
            pos = (sx + 2, sy) if first in "ud" else (sx + 1, sy - 1)
            labels.append((pos, edge["label"]))

    canvas: dict[Point, str] = {cell: _JOINT[frozenset(d)] for cell, d in links.items()}
    for node in model["nodes"]:
        left, _, top = bounds(node)
        for dy, row in enumerate(shape_rows(node)):
            first = len(row) - len(row.lstrip(" "))
            last = len(row.rstrip(" "))
            for dx in range(first, last):
                canvas[(left + dx, top + dy)] = row[dx]
    canvas.update(arrows)
    for (x, y), text in labels:
        for i, ch in enumerate(text):
            canvas[(x + i, y)] = ch

    max_x = max(x for x, _ in canvas)
    max_y = max(y for _, y in canvas)
    rows = []
    for y in range(max_y + 1):
        rows.append("".join(canvas.get((x, y), " ") for x in range(max_x + 1)).rstrip())
    return "\n".join(rows)


# --- validation -------------------------------------------------------------

def validate(model: dict) -> list[str]:
    """Return a list of problems (empty list = model is fine)."""
    problems: list[str] = []
    ids = [n["id"] for n in model.get("nodes", [])]
    if len(ids) != len(set(ids)):
        problems.append("duplicate node ids")
    known = set(ids)
    for n in model.get("nodes", []):
        if n.get("type") not in NODE_TYPES:
            problems.append(f"{n.get('id')}: bad type {n.get('type')!r}")
    if sum(n["type"] == "start" for n in model.get("nodes", [])) != 1:
        problems.append("exactly one start node required")
    for e in model.get("edges", []):
        for key in ("from", "to"):
            if e.get(key) not in known:
                problems.append(f"edge {e}: unknown node {e.get(key)!r}")
        for key in ("from_side", "to_side"):
            if key in e and e[key] not in SIDES:
                problems.append(f"edge {e}: bad side {e[key]!r}")
    outgoing: dict[str, list[dict]] = {}
    for e in model.get("edges", []):
        outgoing.setdefault(e["from"], []).append(e)
    for n in model.get("nodes", []):
        whens = sorted(e.get("when", "") for e in outgoing.get(n["id"], []))
        expected = {"end": [], "decision": ["no", "yes"], "loop": ["body", "exit"]}.get(
            n["type"], [""]
        )
        if whens != expected:
            problems.append(f"{n['id']}: outgoing edges {whens}, expected {expected}")
    return problems
