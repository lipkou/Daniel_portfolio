from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action

from .models import Project, Report
from .serializers import ProjectSerializer, ReportDetailSerializer, ReportListSerializer
from .text import render_report


class ReportViewSet(viewsets.ReadOnlyModelViewSet):
    """Published lab reports. Read-only; content is edited in Django admin."""

    lookup_field = "slug"

    def get_queryset(self):
        return Report.objects.filter(is_published=True).prefetch_related("tasks")

    def get_serializer_class(self):
        return ReportListSerializer if self.action == "list" else ReportDetailSerializer

    @extend_schema(responses={(200, "text/plain"): OpenApiTypes.STR})
    @action(detail=True, methods=["get"], url_path="text")
    def text(self, request, slug=None):
        """The whole report as plain UTF-8 text — `curl` it and read."""
        report = self.get_object()
        return HttpResponse(render_report(report), content_type="text/plain; charset=utf-8")


class ProjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Project.objects.filter(is_published=True)
    serializer_class = ProjectSerializer
