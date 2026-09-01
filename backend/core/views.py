from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class SummaryView(APIView):
    """
    Aggregate report over a date range (defaults to today).
    GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from sales.models import ReturnTxn, Sale, TenderMethod

        today = str(timezone.localdate())
        d_from = request.query_params.get("from") or today
        d_to = request.query_params.get("to") or today

        sales = (
            Sale.objects
            .filter(created_at__date__gte=d_from, created_at__date__lte=d_to,
                    is_exchange_replacement=False)
            .prefetch_related("lines", "payments")
        )
        rets = ReturnTxn.objects.filter(
            created_at__date__gte=d_from, created_at__date__lte=d_to
        )

        tender = {"CASH": 0, "CARD": 0, "UPI": 0}
        for s in sales:
            for p in s.payments.exclude(method=TenderMethod.STORE_CREDIT):
                if p.method in tender:
                    tender[p.method] += p.amount_paise
        for r in rets:
            if r.refund_method in tender:
                tender[r.refund_method] -= r.refund_amount_paise

        gross = sum(s.total_paise for s in sales)
        refunds = sum(r.refund_amount_paise for r in rets)

        return Response({
            "from": d_from,
            "to": d_to,
            "sales_count": sales.count(),
            "units": sum(l.qty for s in sales for l in s.lines.all()),
            "subtotal_paise": sum(s.subtotal_paise for s in sales),
            "discount_paise": sum(s.discount_paise for s in sales),
            "tax_paise": sum(s.tax_paise for s in sales),
            "gross_paise": gross,
            "refunds_count": rets.filter(kind=ReturnTxn.Kind.REFUND).count(),
            "exchanges_count": rets.filter(kind=ReturnTxn.Kind.EXCHANGE).count(),
            "returned_value_paise": sum(r.returned_value_paise for r in rets),
            "refund_paise": refunds,
            "collect_paise": sum(r.collect_amount_paise for r in rets),
            "net_sales_paise": gross - refunds,
            "tender_mix": {
                "cash_paise": tender["CASH"],
                "card_paise": tender["CARD"],
                "upi_paise": tender["UPI"],
            },
        })
