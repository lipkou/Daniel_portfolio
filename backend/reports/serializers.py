from django.conf import settings
from rest_framework import serializers

from .models import Project, Report, Task
from .text import demo_url


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "order", "title", "statement", "model", "algorithm", "code", "language", "output",
        ]


class ReportListSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    url = serializers.HyperlinkedIdentityField(view_name="report-detail", lookup_field="slug")
    text_url = serializers.HyperlinkedIdentityField(view_name="report-text", lookup_field="slug")

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
