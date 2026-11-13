from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response

from .models import Project, Report
from .serializers import ProjectSerializer, ReportDetailSerializer, ReportListSerializer
from .text import render_report


class PlainTextRenderer(BaseRenderer):
    """Lets clients ask for `Accept: text/plain` (Swagger UI does exactly that).

    Without it DRF's content negotiation rejects the request with 406 before the
    view runs. Errors (e.g. 404 {"detail": ...}) are rendered as their message.
    """

    media_type = "text/plain"
    format = "txt"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if isinstance(data, dict) and "detail" in data:
            data = str(data["detail"])
        return str(data).encode(self.charset)


class ReportViewSet(viewsets.ReadOnlyModelViewSet):
    """Published lab reports. Read-only; content is edited in Django admin."""

    lookup_field = "slug"

    def get_queryset(self):
        return Report.objects.filter(is_published=True).prefetch_related("tasks")

    def get_serializer_class(self):
        return ReportListSerializer if self.action == "list" else ReportDetailSerializer

    @extend_schema(responses={(200, "text/plain"): OpenApiTypes.STR})
    @action(
        detail=True,
        methods=["get"],
        url_path="text",
        # text/plain first: `curl` (Accept: */*) and Swagger (Accept: text/plain) get text
        renderer_classes=[PlainTextRenderer, JSONRenderer],
    )
    def text(self, request, slug=None):
        """The whole report as plain UTF-8 text — `curl` it and read."""
        report = self.get_object()
        return Response(render_report(report), content_type="text/plain; charset=utf-8")


class ProjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Project.objects.filter(is_published=True)
    serializer_class = ProjectSerializer
