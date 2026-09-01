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
    """Sales-reporting dashboard for today, with charts data."""

    def get(self, request):
        from datetime import timedelta

        from sales.models import ReturnTxn, Sale, TenderMethod

        today = timezone.localdate()
        sales = (
            Sale.objects
            .filter(created_at__date=today, is_exchange_replacement=False)
            .prefetch_related("lines__variant__style__category", "payments")
        )
        returns = ReturnTxn.objects.filter(created_at__date=today)

        tender = {"CASH": 0, "CARD": 0, "UPI": 0}
        by_hour = {h: {"sales_paise": 0, "txns": 0} for h in range(8, 22)}  # trading hrs
        by_style, by_cat = {}, {}
        units = gross = 0

        for s in sales:
            gross += s.total_paise
            for p in s.payments.exclude(method=TenderMethod.STORE_CREDIT):
                if p.method in tender:
                    tender[p.method] += p.amount_paise
            h = timezone.localtime(s.created_at).hour
            b = by_hour.setdefault(h, {"sales_paise": 0, "txns": 0})
            b["sales_paise"] += s.total_paise
            b["txns"] += 1
            for l in s.lines.all():
                units += l.qty
                st = l.variant.style
                d = by_style.setdefault(st.name, {"units": 0, "revenue_paise": 0})
                d["units"] += l.qty
                d["revenue_paise"] += l.line_total_paise
                by_cat[st.category.name] = by_cat.get(st.category.name, 0) + l.line_total_paise

        last_7 = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            day = Sale.objects.filter(created_at__date=d, is_exchange_replacement=False)
            last_7.append({
                "date": d.isoformat(),
                "gross_paise": sum(x.total_paise for x in day),
                "txns": day.count(),
            })

        refunds = sum(r.refund_amount_paise for r in returns)
        n = sales.count()

        return Response({
            "date": today,
            "transactions": n,
            "units_sold": units,
            "gross_sales_paise": gross,
            "net_sales_paise": gross - refunds,
            "avg_basket_paise": round(gross / n) if n else 0,
            "discounts_paise": sum(s.discount_paise for s in sales),
            "tax_paise": sum(s.tax_paise for s in sales),
            "refunds_paise": refunds,
            "exchanges": returns.filter(kind=ReturnTxn.Kind.EXCHANGE).count(),
            "returns": returns.filter(kind=ReturnTxn.Kind.REFUND).count(),
            "tender_mix": {
                "cash_paise": tender["CASH"],
                "card_paise": tender["CARD"],
                "upi_paise": tender["UPI"],
            },
            "by_hour": [{"hour": h, **by_hour[h]} for h in sorted(by_hour)],
            "top_styles": sorted(
                ({"style": k, **v} for k, v in by_style.items()),
                key=lambda x: x["units"], reverse=True,
            )[:6],
            "category_mix": sorted(
                ({"category": k, "revenue_paise": v} for k, v in by_cat.items()),
                key=lambda x: x["revenue_paise"], reverse=True,
            ),
            "last_7_days": last_7,
        })
