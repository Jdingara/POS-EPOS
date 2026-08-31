from rest_framework.routers import DefaultRouter

from .views import (
    BrandViewSet,
    CategoryViewSet,
    PromotionViewSet,
    StyleViewSet,
    VariantViewSet,
)

router = DefaultRouter(trailing_slash=False)
router.register("categories", CategoryViewSet)
router.register("brands", BrandViewSet)
router.register("styles", StyleViewSet, basename="style")
router.register("variants", VariantViewSet, basename="variant")
router.register("promotions", PromotionViewSet)

urlpatterns = router.urls
