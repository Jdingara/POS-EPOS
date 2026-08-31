from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CheckoutView, QuoteView, ReturnView, SaleViewSet

router = DefaultRouter(trailing_slash=False)
router.register("sales", SaleViewSet, basename="sale")

urlpatterns = [
    path("quote", QuoteView.as_view()),
    path("checkout", CheckoutView.as_view()),
    path("returns", ReturnView.as_view()),
] + router.urls
