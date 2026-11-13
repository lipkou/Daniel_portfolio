"""Render a Report as a plain-text document in the professor's report format."""

import textwrap

from django.conf import settings

from .flowchart import LEGEND, render_ascii
from .models import Report

WIDTH = 76


def _center(line: str) -> str:
    return "\n".join(part.center(WIDTH).rstrip() for part in textwrap.wrap(line, WIDTH - 8))


def _rule(char: str = "─") -> str:
    return char * WIDTH


def _indent(text: str, prefix: str = "    ") -> str:
    return "\n".join(prefix + line if line else "" for line in text.strip("\n").splitlines())


def _wrap(text: str) -> str:
    return "\n".join(
        textwrap.fill(par, WIDTH, subsequent_indent="  " if par.startswith("•") else "")
        for par in text.strip().splitlines()
    )


def demo_url(report: Report) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/labs/{report.slug}"


def render_report(report: Report) -> str:
    s = settings.STUDENT
    kind_genitive = (
        "лабораторної роботи" if report.kind == Report.Kind.LAB else "практичної роботи"
    )

    out: list[str] = [
        _center("МІНІСТЕРСТВО ОСВІТИ ТА НАУКИ УКРАЇНИ"),
        _center(s["university"]),
        "",
        _center(s["faculty"]),
        _center(s["department"]),
        "",
        "",
        _center("ЗВІТ"),
        _center(f"з виконання {kind_genitive} №{report.number}"),
        _center(f"з дисципліни «{report.discipline}»"),
        _center(f"на тему: «{report.topic}»"),
        _center(f"Варіант №{s['variant']}"),
        "",
        "",
        f"{'Виконав:':>{WIDTH - 24}}",
        f"{'студент групи ' + s['group']:>{WIDTH - 2}}",
        f"{s['name']:>{WIDTH - 2}}",
        "",
        f"{'Перевірив:':>{WIDTH - 22}}",
        f"{s['teacher']:>{WIDTH - 2}}",
        "",
        _center(f"{s['city']} {report.year}"),
        _rule("═"),
        "",
        "МЕТА РОБОТИ",
        _wrap(report.goal),
        "",
    ]

    if report.theory.strip():
        out += ["КОРОТКО: ЧОГО НАВЧИЛИСЬ", _wrap(report.theory), ""]

    tasks = list(report.tasks.all())
    if any(t.model for t in tasks):
        out += ["Умовні позначення блоків:", _indent(LEGEND, "  "), ""]

    for task in tasks:
        out += [_rule(), f"ЗАВДАННЯ {task.order}. {task.title}", _rule(), ""]
        out += ["Умова:", _indent(task.statement), ""]
        if task.model:
            out += ["Модель (блок-схема):", "", _indent(render_ascii(task.model), "  "), ""]
            if task.model.get("note"):
                out += [_wrap("Примітка: " + task.model["note"]), ""]
        if task.algorithm.strip():
            out += ["Алгоритм:", _indent(task.algorithm), ""]
        if task.code.strip():
            lang = f" ({task.language})" if task.language else ""
            out += [f"Код програми{lang}:", _indent(task.code), ""]
        if task.output.strip():
            out += ["Результат виконання:", _indent(task.output), ""]

    out += [_rule("═"), "ВИСНОВОК", _wrap(report.conclusion), ""]
    if any(t.model for t in tasks):
        out += [
            _rule(),
            "Інтерактивна модель: можна задати вхідні дані та подивитись анімацію",
            "виконання кожної блок-схеми крок за кроком:",
            "  " + demo_url(report),
            "",
            _wrap(
                "Як це працює: анімація та обчислення моделей виконуються в браузері на "
                "JavaScript (власний інтерпретатор блок-схем), а цей текстовий звіт з "
                "ASCII-схемами генерує бекенд на Python (Django REST Framework) з тієї ж "
                "моделі. Код на C++ наведено як вимогу методички — він не є частиною механіки "
                "сайту."
            ),
            "",
        ]
    return "\n".join(out)
