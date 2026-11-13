from django.db import models


class Report(models.Model):
    """A lab report ("звіт з лабораторної роботи") served as text via the API."""

    class Kind(models.TextChoices):
        LAB = "lab", "Лабораторна робота"
        PRACTICE = "practice", "Практична робота"

    kind = models.CharField("Тип", max_length=16, choices=Kind.choices, default=Kind.LAB)
    number = models.PositiveSmallIntegerField("Номер роботи")
    slug = models.SlugField("Slug (для URL)", unique=True)
    discipline = models.CharField("Дисципліна", max_length=200, default="Основи програмування")
    topic = models.CharField("Тема", max_length=300)
    goal = models.TextField("Мета роботи")
    theory = models.TextField("Загальні відомості", blank=True)
    conclusion = models.TextField("Висновок")
    year = models.PositiveSmallIntegerField("Рік", default=2026)
    is_published = models.BooleanField("Опубліковано", default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kind", "number"]
        verbose_name = "Звіт"
        verbose_name_plural = "Звіти"

    def __str__(self) -> str:
        return f"{self.get_kind_display()} №{self.number}: {self.topic}"


class Task(models.Model):
    """One task (завдання) inside a report — always variant 8."""

    report = models.ForeignKey(Report, related_name="tasks", on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField("Порядок", default=1)
    title = models.CharField("Назва", max_length=300)
    statement = models.TextField("Умова (варіант 8)")
    model = models.JSONField(
        "Модель блок-схеми (JSON)", default=dict, blank=True,
        help_text="Вузли й зв'язки; з неї рендеряться ASCII-схема в API та анімація на сайті.",
    )
    algorithm = models.TextField("Алгоритм / блок-схема (текстом)", blank=True)
    code = models.TextField("Код програми", blank=True)
    language = models.CharField("Мова коду", max_length=32, default="cpp", blank=True)
    output = models.TextField("Результат виконання", blank=True)

    class Meta:
        ordering = ["order"]
        verbose_name = "Завдання"
        verbose_name_plural = "Завдання"

    def __str__(self) -> str:
        return f"{self.order}. {self.title}"


class Project(models.Model):
    """Portfolio project card."""

    title = models.CharField("Назва", max_length=200)
    description = models.TextField("Опис")
    tech = models.CharField("Технології (через кому)", max_length=300, blank=True)
    url = models.URLField("Посилання", blank=True)
    repo_url = models.URLField("Репозиторій", blank=True)
    order = models.PositiveSmallIntegerField("Порядок", default=0)
    is_published = models.BooleanField("Опубліковано", default=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Проєкт"
        verbose_name_plural = "Проєкти"

    def __str__(self) -> str:
        return self.title
