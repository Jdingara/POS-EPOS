from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from .models import Brand, Category, Promotion, StockMovement, Style, Variant
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    PromotionSerializer,
    StockAdjustSerializer,
    StockMovementSerializer,
    StyleSerializer,
    VariantSerializer,
)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = None


class BrandViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    pagination_class = None


class StyleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StyleSerializer
    pagination_class = None

    def get_queryset(self):
        qs = (
            Style.objects.filter(is_active=True)
            .select_related("category", "brand")
            .prefetch_related("variants")
        )
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(style_code__icontains=search)
                | Q(brand__name__icontains=search)
                | Q(category__name__icontains=search)
            )
        return qs


class VariantViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VariantSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Variant.objects.select_related("style", "style__category", "style__brand")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(barcode=search)
                | Q(style__name__icontains=search)
                | Q(style__style_code__icontains=search)
                | Q(color__icontains=search)
            )
        return qs

    @action(detail=True, methods=["get"])
    def movements(self, request, pk=None):
        rows = StockMovement.objects.filter(variant_id=pk)[:50]
        return Response(StockMovementSerializer(rows, many=True).data)

    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        """Manual stock adjustment - manager only (receive / write-off / correction)."""
        if not request.user.is_manager:
            raise PermissionDenied("Stock adjustments need a manager.")
        variant = self.get_object()
        s = StockAdjustSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        delta = s.validated_data["delta"]
        with transaction.atomic():
            variant.stock += delta
            variant.save(update_fields=["stock"])
            StockMovement.objects.create(
                variant=variant,
                delta=delta,
                reason=s.validated_data["reason"],
                note=s.validated_data["note"],
                created_by=request.user,
            )
        return Response(VariantSerializer(variant).data)


class PromotionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Promotion.objects.filter(active=True).prefetch_related("styles")
    serializer_class = PromotionSerializer
    pagination_class = None
