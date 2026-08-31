from dataclasses import asdict

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from catalog.pricing import quote as build_quote
from till.services import current_session

from .models import Sale
from .serializers import (
    CheckoutSerializer,
    QuoteRequestSerializer,
    ReturnRequestSerializer,
    ReturnTxnSerializer,
    SaleListSerializer,
    SaleSerializer,
)
from .services import checkout, process_return


def quote_to_dict(q) -> dict:
    return {
        "lines": [asdict(l) for l in q.lines],
        "subtotal_paise": q.subtotal_paise,
        "discount_paise": q.discount_paise,
        "taxable_paise": q.taxable_paise,
        "tax_paise": q.tax_paise,
        "total_paise": q.total_paise,
        "tax_breakup": q.tax_breakup,
    }


class QuoteView(APIView):
    """Price a cart without committing anything (used for the live cart)."""

    def post(self, request):
        s = QuoteRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        items = [{"variant": r["variant_id"], "qty": r["qty"]} for r in s.validated_data["items"]]
        q = build_quote(items, timezone.localdate())
        return Response(quote_to_dict(q))


class CheckoutView(APIView):
    def post(self, request):
        s = CheckoutSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        sale = checkout(
            cashier=request.user,
            till_session=current_session(),
            items=s.validated_data["items"],
            payments=s.validated_data["payments"],
        )
        return Response(SaleSerializer(sale).data, status=201)


class ReturnView(APIView):
    def post(self, request):
        s = ReturnRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        original = get_object_or_404(Sale, number=data["original_number"])
        approver = None
        if data.get("approved_by_id"):
            approver = get_object_or_404(User, pk=data["approved_by_id"])
        rt = process_return(
            cashier=request.user,
            till_session=current_session(),
            original_sale=original,
            return_items=data["return_items"],
            kind=data["kind"],
            refund_method=data["refund_method"],
            exchange_items=data["exchange_items"],
            collect_method=data["collect_method"],
            approved_by=approver,
            override_window=data["override_window"],
        )
        return Response(ReturnTxnSerializer(rt).data, status=201)


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    lookup_field = "number"
    lookup_value_regex = "[^/]+"
    pagination_class = None

    def get_queryset(self):
        qs = Sale.objects.prefetch_related("lines", "payments").order_by("-created_at")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(number__icontains=search))
        return qs

    def get_serializer_class(self):
        return SaleListSerializer if self.action == "list" else SaleSerializer

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()[:15]
        return Response(SaleListSerializer(qs, many=True).data)
