from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import IsManagerOrReadOnly

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


def _wants_all(request):
    return request.query_params.get("all") in ("1", "true", "yes")


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "head", "options"]  # add + list only


class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "head", "options"]


class StyleViewSet(viewsets.ModelViewSet):
    serializer_class = StyleSerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None
    # no hard delete - the Back Office deactivates (is_active=False) instead,
    # because a Style whose variant has ever been sold is PROTECTed
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        qs = Style.objects.select_related("category", "brand").prefetch_related("variants")
        if not _wants_all(self.request):
            qs = qs.filter(is_active=True)          # operational screens: active only
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(style_code__icontains=search)
                | Q(brand__name__icontains=search)
                | Q(category__name__icontains=search)
            )
        return qs


class VariantViewSet(viewsets.ModelViewSet):
    serializer_class = VariantSerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        qs = Variant.objects.select_related("style", "style__category", "style__brand")
        search = self.request.query_params.get("search")
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(barcode__icontains=search)        # partial barcode: start / middle / end
                | Q(style__name__icontains=search)
                | Q(style__style_code__icontains=search)
                | Q(color__icontains=search)
                | Q(size__iexact=search)
            )
        return qs

    # --- keep the stock ledger honest when a variant is created / edited here ---
    def perform_create(self, serializer):
        data = serializer.validated_data
        if not data.get("barcode"):
            serializer.validated_data["barcode"] = self._gen_barcode()
        variant = serializer.save()
        if variant.stock:
            StockMovement.objects.create(
                variant=variant, delta=variant.stock,
                reason=StockMovement.Reason.RECEIVE, note="opening stock (Back Office)",
                created_by=self.request.user,
            )

    def perform_update(self, serializer):
        old = serializer.instance.stock
        variant = serializer.save()
        if variant.stock != old:
            StockMovement.objects.create(
                variant=variant, delta=variant.stock - old,
                reason=StockMovement.Reason.CORRECTION, note="Back Office edit",
                created_by=self.request.user,
            )

    @staticmethod
    def _gen_barcode():
        base = 8800000000000
        last = Variant.objects.order_by("-id").first()
        n = (last.id if last else 0) + 1
        code = str(base + n)
        while Variant.objects.filter(barcode=code).exists():
            n += 1
            code = str(base + n)
        return code

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


class PromotionViewSet(viewsets.ModelViewSet):
    serializer_class = PromotionSerializer
    permission_classes = [IsManagerOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        qs = Promotion.objects.prefetch_related("styles")
        if not _wants_all(self.request):
            qs = qs.filter(active=True)             # operational screens: live only
        return qs
