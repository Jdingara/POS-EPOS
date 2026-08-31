from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import CashMovement, TillSession


def current_session():
    return TillSession.objects.filter(status=TillSession.Status.OPEN).first()


def open_session(*, user, opening_float_paise: int) -> TillSession:
    if current_session():
        raise ValidationError("A till session is already open.")
    return TillSession.objects.create(opened_by=user, opening_float_paise=opening_float_paise)


def expected_cash(session: TillSession) -> int:
    total = session.opening_float_paise
    for m in session.movements.all():
        total += m.signed_paise
    return total


def summary(session: TillSession) -> dict:
    buckets = {t: 0 for t, _ in CashMovement.Type.choices}
    for m in session.movements.all():
        buckets[m.type] += m.amount_paise
    return {
        "opening_float_paise": session.opening_float_paise,
        "cash_sales_paise": buckets[CashMovement.Type.CASH_SALE],
        "cash_refunds_paise": buckets[CashMovement.Type.CASH_REFUND],
        "exchange_collect_paise": buckets[CashMovement.Type.EXCHANGE_COLLECT],
        "paid_out_paise": buckets[CashMovement.Type.PAID_OUT],
        "safe_drop_paise": buckets[CashMovement.Type.SAFE_DROP],
        "expected_paise": expected_cash(session),
    }


def z_report(session: TillSession, *, expected=None, counted=None, variance=None) -> dict:
    """Aggregate everything that happened while this session was open."""
    from sales.models import Payment, ReturnTxn, Sale, TenderMethod

    since = session.opened_at
    until = session.closed_at or timezone.now()

    sales = Sale.objects.filter(created_at__gte=since, created_at__lte=until)
    real_sales = sales.filter(is_exchange_replacement=False)
    returns = ReturnTxn.objects.filter(created_at__gte=since, created_at__lte=until)

    tender = {m: 0 for m in [TenderMethod.CASH, TenderMethod.CARD, TenderMethod.UPI]}
    for p in Payment.objects.filter(sale__in=sales).exclude(method=TenderMethod.STORE_CREDIT):
        if p.method in tender:
            tender[p.method] += p.amount_paise
    for rt in returns:
        if rt.refund_method in tender:
            tender[rt.refund_method] -= rt.refund_amount_paise

    return {
        "till_id": session.pk,
        "opened_at": since,
        "closed_at": session.closed_at,
        "opened_by": session.opened_by.username,
        "transactions": real_sales.count(),
        "gross_sales_paise": sum(s.total_paise for s in real_sales),
        "discounts_paise": sum(s.discount_paise for s in real_sales),
        "tax_paise": sum(s.tax_paise for s in real_sales),
        "returns_count": returns.filter(kind=ReturnTxn.Kind.REFUND).count(),
        "exchanges_count": returns.filter(kind=ReturnTxn.Kind.EXCHANGE).count(),
        "refunds_paise": sum(r.refund_amount_paise for r in returns),
        "tender_mix": {
            "cash_paise": tender[TenderMethod.CASH],
            "card_paise": tender[TenderMethod.CARD],
            "upi_paise": tender[TenderMethod.UPI],
        },
        "drawer_expected_paise": expected if expected is not None else session.expected_paise,
        "drawer_counted_paise": counted if counted is not None else session.counted_paise,
        "variance_paise": variance if variance is not None else session.variance_paise,
        "tolerance_paise": settings.POS["CASH_VARIANCE_TOLERANCE_PAISE"],
    }


def close_session(*, session, user, counted_paise, note="", signed_off_by=None) -> dict:
    expected = expected_cash(session)
    variance = counted_paise - expected
    tolerance = settings.POS["CASH_VARIANCE_TOLERANCE_PAISE"]

    if abs(variance) > tolerance and (not note.strip() or signed_off_by is None):
        raise ValidationError(
            f"Variance {variance} is outside tolerance ({tolerance}). "
            "A reason and a manager sign-off are required."
        )
    if signed_off_by is not None and not signed_off_by.is_manager:
        raise ValidationError("Sign-off must be by a manager.")

    session.status = TillSession.Status.CLOSED
    session.closed_by = user
    session.closed_at = timezone.now()
    session.expected_paise = expected
    session.counted_paise = counted_paise
    session.variance_paise = variance
    session.count_note = note
    session.signed_off_by = signed_off_by
    session.save()

    return z_report(session, expected=expected, counted=counted_paise, variance=variance)
