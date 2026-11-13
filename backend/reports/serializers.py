from django.conf import settings
from django.urls import reverse
from rest_framework import serializers

from .models import Project, Report, Task
from .text import demo_url


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "order", "title", "statement", "model", "algorithm", "code", "language", "output",
        ]


def public_url(view_name: str, slug: str) -> str:
    """Absolute URL built from the public FRONTEND_URL, not from the request.

    Behind a proxy (Vite preview, nginx) the request's Host may be 127.0.0.1:8000,
    which would leak into the links the professor sees.
    """
    return settings.FRONTEND_URL.rstrip("/") + reverse(view_name, kwargs={"slug": slug})


class ReportListSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    url = serializers.SerializerMethodField()
    text_url = serializers.SerializerMethodField()

    def get_url(self, obj) -> str:
        return public_url("report-detail", obj.slug)

    def get_text_url(self, obj) -> str:
        return public_url("report-text", obj.slug)

    class Meta:
        model = Report
        fields = [
            "slug", "kind", "kind_display", "number", "discipline", "topic",
            "year", "updated_at", "url", "text_url",
        ]


class ReportDetailSerializer(ReportListSerializer):
    tasks = TaskSerializer(many=True, read_only=True)
    student = serializers.SerializerMethodField()
    demo_url = serializers.SerializerMethodField()

    class Meta(ReportListSerializer.Meta):
        fields = ReportListSerializer.Meta.fields + [
            "student", "goal", "theory", "tasks", "conclusion", "demo_url",
        ]

    def get_student(self, obj) -> dict:
        return settings.STUDENT

    def get_demo_url(self, obj) -> str:
        return demo_url(obj)


class ProjectSerializer(serializers.ModelSerializer):
    tech = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "title", "description", "tech", "url", "repo_url"]

    def get_tech(self, obj) -> list[str]:
        return [t.strip() for t in obj.tech.split(",") if t.strip()]
