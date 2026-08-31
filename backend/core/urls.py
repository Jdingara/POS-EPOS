from django.http import JsonResponse
from django.urls import path


def health(_request):
    return JsonResponse({"status": "ok", "service": "apparel-pos-api"})


urlpatterns = [
    path("health", health),
]
