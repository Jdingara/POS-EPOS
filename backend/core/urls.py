from django.http import JsonResponse
from django.urls import path

from .views import SummaryView


def health(_request):
    return JsonResponse({"status": "ok", "service": "apparel-pos-api"})


urlpatterns = [
    path("health", health),
    path("reports/summary", SummaryView.as_view()),
]
