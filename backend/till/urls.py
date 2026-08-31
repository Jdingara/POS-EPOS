from django.urls import path

from .views import (
    CloseTillView,
    CurrentTillView,
    DashboardView,
    MovementView,
    OpenTillView,
    ZReportView,
)

urlpatterns = [
    path("current", CurrentTillView.as_view()),
    path("open", OpenTillView.as_view()),
    path("movements", MovementView.as_view()),
    path("close", CloseTillView.as_view()),
    path("<int:pk>/zreport", ZReportView.as_view()),
    path("dashboard", DashboardView.as_view()),
]
