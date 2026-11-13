from django.contrib import admin

from .models import Project, Report, Task


class TaskInline(admin.StackedInline):
    model = Task
    extra = 0


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["__str__", "slug", "is_published", "updated_at"]
    list_filter = ["kind", "is_published"]
    list_editable = ["is_published"]
    prepopulated_fields = {"slug": ["topic"]}
    inlines = [TaskInline]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["title", "order", "is_published"]
    list_editable = ["order", "is_published"]
