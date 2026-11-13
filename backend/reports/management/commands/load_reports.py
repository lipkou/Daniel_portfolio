"""Load (create or update) reports from reports/content/*.json.

    python manage.py load_reports
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from reports.flowchart import validate
from reports.models import Report, Task

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"
REPORT_FIELDS = [
    "kind", "number", "discipline", "topic", "year", "is_published",
    "goal", "theory", "conclusion",
]
TASK_FIELDS = ["title", "statement", "model", "algorithm", "code", "language", "output"]


def load_file(path: Path) -> Report:
    data = json.loads(path.read_text(encoding="utf-8"))
    for task in data.get("tasks", []):
        problems = validate(task["model"]) if task.get("model") else []
        if problems:
            raise CommandError(f"{path.name}, task {task['order']}: " + "; ".join(problems))

    with transaction.atomic():
        report, _ = Report.objects.update_or_create(
            slug=data["slug"], defaults={k: data[k] for k in REPORT_FIELDS if k in data}
        )
        report.tasks.all().delete()
        for task in data.get("tasks", []):
            Task.objects.create(
                report=report, order=task["order"],
                **{k: task[k] for k in TASK_FIELDS if k in task},
            )
    return report


class Command(BaseCommand):
    help = "Create or update reports from reports/content/*.json"

    def handle(self, *args, **options):
        files = sorted(CONTENT_DIR.glob("*.json"))
        if not files:
            raise CommandError(f"No content files in {CONTENT_DIR}")
        for path in files:
            report = load_file(path)
            self.stdout.write(self.style.SUCCESS(f"✓ {report.slug}: {report}"))
