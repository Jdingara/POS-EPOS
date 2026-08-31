from django.urls import path

from .views import LoginView, MeView, StaffListView

urlpatterns = [
    path("login", LoginView.as_view()),
    path("me", MeView.as_view()),
    path("staff", StaffListView.as_view()),
]
