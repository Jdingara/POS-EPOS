from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/catalog/", include("catalog.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/till/", include("till.urls")),
]
