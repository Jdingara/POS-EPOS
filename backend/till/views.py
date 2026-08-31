from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User

from .models import CashMovement, TillSession
from .serializers import (
    CloseTillSerializer,
    MovementInSerializer,
    OpenTillSerializer,
    TillSessionSerializer,
)
from .services import (
    close_session,
    current_session,
    open_session,
    summary,
    z_report,
)


class CurrentTillView(APIView):
    def get(self, request):
        s = current_session()
        if not s:
            return Response({"open": False})
        return Response({
            "open": True,
            "session": TillSessionSerializer(s).data,
            "summary": summary(s),
        })


class OpenTillView(APIView):
    def post(self, request):
        body = OpenTillSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        s = open_session(user=request.user, opening_float_paise=body.validated_data["opening_float_paise"])
        return Response(TillSessionSerializer(s).data, status=201)


class MovementView(APIView):
    def post(self, request):
        s = current_session()
        if not s:
            return Response({"detail": "No open till."}, status=400)
        body = MovementInSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        CashMovement.objects.create(
            session=s,
            type=body.validated_data["type"],
            amount_paise=body.validated_data["amount_paise"],
            note=body.validated_data["note"],
        )
        return Response(summary(s))


class CloseTillView(APIView):
    def post(self, request):
        s = current_session()
        if not s:
            return Response({"detail": "No open till."}, status=400)
        body = CloseTillSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        approver = None
        if body.validated_data.get("signed_off_by_id"):
            approver = get_object_or_404(User, pk=body.validated_data["signed_off_by_id"])
        report = close_session(
            session=s,
            user=request.user,
            counted_paise=body.validated_data["counted_paise"],
            note=body.validated_data["note"],
            signed_off_by=approver,
        )
        return Response(report)


class ZReportView(APIView):
    def get(self, request, pk):
        s = get_object_or_404(TillSession, pk=pk)
        return Response(z_report(s))


class DashboardView(APIView):
    """Simple KPI tiles for today (Sales Reporting Dashboard module)."""

    def get(self, request):
        from sales.models import ReturnTxn, Sale, TenderMethod

        today = timezone.localdate()
        sales = Sale.objects.filter(created_at__date=today, is_exchange_replacement=False)
        returns = ReturnTxn.objects.filter(created_at__date=today)

        tender = {"CASH": 0, "CARD": 0, "UPI": 0}
        for s in sales:
            for p in s.payments.exclude(method=TenderMethod.STORE_CREDIT):
                if p.method in tender:
                    tender[p.method] += p.amount_paise

        units = sum(l.qty for s in sales for l in s.lines.all())
        gross = sum(s.total_paise for s in sales)
        return Response({
            "date": today,
            "transactions": sales.count(),
            "units_sold": units,
            "gross_sales_paise": gross,
            "avg_basket_paise": round(gross / sales.count()) if sales.count() else 0,
            "discounts_paise": sum(s.discount_paise for s in sales),
            "refunds_paise": sum(r.refund_amount_paise for r in returns),
            "exchanges": returns.filter(kind=ReturnTxn.Kind.EXCHANGE).count(),
            "returns": returns.filter(kind=ReturnTxn.Kind.REFUND).count(),
            "tender_mix": {
                "cash_paise": tender["CASH"],
                "card_paise": tender["CARD"],
                "upi_paise": tender["UPI"],
            },
        })
