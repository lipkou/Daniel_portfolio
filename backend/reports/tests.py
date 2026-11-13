from django.test import TestCase
from rest_framework.test import APIClient

from .models import Project, Report, Task


class ReportApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.report = Report.objects.create(
            number=1, slug="lab-1", topic="Побудова блок-схем алгоритмів",
            goal="Засвоїти розробку алгоритмів.", conclusion="Все вийшло.",
            is_published=True,
        )
        Task.objects.create(
            report=self.report, order=1, title="Лінійний алгоритм",
            statement="A = ...", code="int main() { return 0; }", output="A = 1",
        )
        Report.objects.create(
            number=2, slug="draft", topic="Чернетка", goal="-", conclusion="-",
        )

    def test_list_shows_only_published(self):
        resp = self.client.get("/api/reports/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([r["slug"] for r in resp.json()], ["lab-1"])

    def test_detail_contains_tasks_and_student(self):
        data = self.client.get("/api/reports/lab-1/").json()
        self.assertEqual(data["tasks"][0]["title"], "Лінійний алгоритм")
        self.assertEqual(data["student"]["variant"], 8)

    def test_links_use_public_url_not_request_host(self):
        with self.settings(FRONTEND_URL="https://example.com"):
            data = self.client.get("/api/reports/", HTTP_HOST="127.0.0.1:8000").json()
        self.assertEqual(data[0]["text_url"], "https://example.com/api/reports/lab-1/text/")
        self.assertEqual(data[0]["url"], "https://example.com/api/reports/lab-1/")

    def test_draft_is_hidden(self):
        self.assertEqual(self.client.get("/api/reports/draft/").status_code, 404)

    def test_text_endpoint_honours_any_reasonable_accept_header(self):
        # Swagger UI sends `Accept: text/plain`; curl sends `*/*`; browsers send text/html,…
        for accept in ["text/plain", "*/*", "text/html,application/xhtml+xml,*/*;q=0.8", None]:
            headers = {"HTTP_ACCEPT": accept} if accept else {}
            resp = self.client.get("/api/reports/lab-1/text/", **headers)
            self.assertEqual(resp.status_code, 200, accept)
            self.assertTrue(resp["Content-Type"].startswith("text/plain"), accept)
            self.assertIn("ЗВІТ", resp.content.decode("utf-8"))

    def test_text_endpoint_404_is_plain_text(self):
        resp = self.client.get("/api/reports/nope/text/", HTTP_ACCEPT="text/plain")
        self.assertEqual(resp.status_code, 404)
        self.assertNotIn("{", resp.content.decode("utf-8"))

    def test_plain_text_report(self):
        resp = self.client.get("/api/reports/lab-1/text/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp["Content-Type"].startswith("text/plain"))
        body = resp.content.decode("utf-8")
        for expected in ["ЗВІТ", "Варіант №8", "ЗАВДАННЯ 1. Лінійний алгоритм",
                         "ВИСНОВОК", "Все вийшло."]:
            self.assertIn(expected, body)

    def test_api_is_read_only(self):
        resp = self.client.post("/api/reports/", {"topic": "hack"}, format="json")
        self.assertEqual(resp.status_code, 405)


class FlowchartTests(TestCase):
    def setUp(self):
        import json
        from pathlib import Path

        files = sorted((Path(__file__).parent / "content").glob("*.json"))
        self.reports = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in files}
        self.tasks = [t for r in self.reports.values() for t in r["tasks"]]

    def test_every_methodology_file_has_its_own_report(self):
        self.assertEqual(sorted(self.reports), ["lab-1", "lab-2", "practice-1"])
        for slug, report in self.reports.items():
            self.assertEqual(report["slug"], slug)
            self.assertTrue(all(t.get("model") for t in report["tasks"]), slug)

    def test_all_content_models_are_valid(self):
        from .flowchart import validate

        for task in self.tasks:
            self.assertEqual(validate(task["model"]), [], task["title"])

    def test_ascii_fits_in_report_width(self):
        from .flowchart import render_ascii
        from .text import WIDTH

        for task in self.tasks:
            art = render_ascii(task["model"])
            self.assertLessEqual(max(map(len, art.splitlines())), WIDTH - 2)
            self.assertIn("Початок", art)
            self.assertIn("Кінець", art)

    def test_validate_catches_broken_model(self):
        from .flowchart import validate

        broken = {
            "nodes": [{"id": "s", "type": "start", "text": "S", "x": 5, "y": 0},
                      {"id": "d", "type": "decision", "text": "?", "x": 5, "y": 5}],
            "edges": [{"from": "s", "to": "d"}, {"from": "d", "to": "ghost", "when": "yes"}],
        }
        problems = validate(broken)
        self.assertTrue(any("ghost" in p for p in problems))
        self.assertTrue(any("expected ['no', 'yes']" in p for p in problems))

    def test_load_reports_command_and_text_output(self):
        from django.core.management import call_command
        from io import StringIO

        call_command("load_reports", stdout=StringIO())
        call_command("load_reports", stdout=StringIO())  # idempotent
        self.assertEqual(Report.objects.get(slug="lab-1").tasks.count(), 4)
        self.assertEqual(Report.objects.get(slug="lab-2").tasks.count(), 2)
        self.assertEqual(Report.objects.get(slug="practice-1").tasks.count(), 4)

        practice = APIClient().get("/api/reports/practice-1/text/").content.decode()
        self.assertIn("з виконання практичної роботи №1", practice)
        self.assertIn("Код програми (cpp):", practice)
        self.assertIn("/labs/practice-1", practice)

        body = APIClient().get("/api/reports/lab-1/text/").content.decode()
        self.assertIn("Модель (блок-схема):", body)
        self.assertIn("/labs/lab-1", body)
        self.assertNotIn("Код програми", body)

        data = APIClient().get("/api/reports/lab-1/").json()
        self.assertTrue(data["demo_url"].endswith("/labs/lab-1"))
        self.assertEqual(len(data["tasks"][1]["model"]["nodes"]), 11)


class ProjectApiTests(TestCase):
    def test_tech_is_split_into_list(self):
        Project.objects.create(title="Сайт", description="d", tech="Django, React")
        data = APIClient().get("/api/projects/").json()
        self.assertEqual(data[0]["tech"], ["Django", "React"])
