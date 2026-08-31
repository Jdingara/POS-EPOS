"""
Transaction logic for checkout and returns/exchanges.

Everything that changes stock or money runs inside a single DB transaction, so a
sale is all-or-nothing. Stock rows are locked (select_for_update) while we read
and decrement them, so two tills can't oversell the last piece.
"""
from datetime import date, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from catalog.models import StockMovement, Variant
from catalog.pricing import quote as build_quote
from core.models import Sequence

from .models import Payment, ReturnLine, ReturnTxn, Sale, SaleLine, TenderMethod


# --------------------------------------------------------------------------- #
#  helpers
# --------------------------------------------------------------------------- #
def _doc_number(prefix: str) -> str:
    ymd = timezone.localdate().strftime("%Y%m%d")
    n = Sequence.next_for(f"{prefix}-{ymd}")
    return f"{prefix}-{ymd}-{n:04d}"


def _lock_variants(variant_ids):
    return {
        v.pk: v
        for v in Variant.objects.select_for_update()
        .select_related("style")
        .filter(pk__in=list(variant_ids))
    }


def _write_sale_from_quote(q, cashier, till_session, *, is_exchange=False) -> Sale:
    sale = Sale.objects.create(
        number=_doc_number("INV"),
        cashier=cashier,
        till_session=till_session,
        is_exchange_replacement=is_exchange,
        subtotal_paise=q.subtotal_paise,
        discount_paise=q.discount_paise,
        tax_paise=q.tax_paise,
        total_paise=q.total_paise,
    )
    for ln in q.lines:
        SaleLine.objects.create(
            sale=sale,
            variant_id=ln.variant_id,
            description=ln.label,
            qty=ln.qty,
            unit_price_paise=ln.unit_price_paise,
            gross_paise=ln.gross_paise,
            discount_paise=ln.discount_paise,
            promo_name=ln.promo_name,
            taxable_paise=ln.taxable_paise,
            tax_rate=ln.tax_rate,
            tax_paise=ln.tax_paise,
            line_total_paise=ln.line_total_paise,
        )
    return sale


def _move_stock(variant, delta, reason, ref, user, note=""):
    variant.stock += delta
    variant.save(update_fields=["stock"])
    StockMovement.objects.create(
        variant=variant, delta=delta, reason=reason, ref=ref, note=note, created_by=user
    )


# --------------------------------------------------------------------------- #
#  checkout  (Branch 1)
# --------------------------------------------------------------------------- #
@transaction.atomic
def checkout(*, cashier, till_session, items, payments, on_date: date | None = None):
    """
    items    : [{"variant_id": int, "qty": int}]
    payments : [{"method": "CASH|CARD|UPI", "amount_paise": int,
                 "cash_received_paise": int?, "ref": str?}]
    """
    on_date = on_date or timezone.localdate()
    if not items:
        raise ValidationError("Cart is empty.")

    locked = _lock_variants(r["variant_id"] for r in items)
    quote_items = []
    for r in items:
        v = locked.get(r["variant_id"])
        if v is None:
            raise ValidationError(f"Unknown variant {r['variant_id']}.")
        if not v.is_sellable:
            raise ValidationError(f"{v.label} is not sellable.")
        if v.stock < r["qty"]:
            raise ValidationError(f"{v.label}: only {v.stock} in stock.")
        quote_items.append({"variant": v, "qty": r["qty"]})

    q = build_quote(quote_items, on_date)
    if not q.lines:
        raise ValidationError("Nothing to sell.")

    paid = sum(int(p["amount_paise"]) for p in payments)
    if paid != q.total_paise:
        raise ValidationError(
            f"Payments {paid} do not match total {q.total_paise}."
        )

    sale = _write_sale_from_quote(q, cashier, till_session)

    for p in payments:
        method = p["method"]
        amount = int(p["amount_paise"])
        cash_recv = p.get("cash_received_paise")
        change = (int(cash_recv) - amount) if (method == TenderMethod.CASH and cash_recv) else None
        Payment.objects.create(
            sale=sale,
            method=method,
            amount_paise=amount,
            cash_received_paise=cash_recv,
            change_paise=change,
            ref=p.get("ref", ""),
        )
        if method == TenderMethod.CASH and till_session:
            _add_cash_movement(till_session, "CASH_SALE", amount, sale.number)

    for ln in q.lines:
        _move_stock(locked[ln.variant_id], -ln.qty, StockMovement.Reason.SALE, sale.number, cashier)

    return sale


# --------------------------------------------------------------------------- #
#  returns & exchanges  (Branch 2)
# --------------------------------------------------------------------------- #
@transaction.atomic
def process_return(
    *,
    cashier,
    till_session,
    original_sale: Sale,
    return_items,          # [{"sale_line_id", "qty", "condition", "reason"}]
    kind,                  # "REFUND" | "EXCHANGE"
    refund_method=TenderMethod.NONE,
    exchange_items=None,   # [{"variant_id", "qty"}]  (EXCHANGE only)
    collect_method=TenderMethod.UPI,
    approved_by=None,
    override_window=False,
    on_date: date | None = None,
):
    on_date = on_date or timezone.localdate()
    exchange_items = exchange_items or []

    # --- policy: return window ------------------------------------------------
    window = settings.POS["RETURN_WINDOW_DAYS"]
    age_days = (timezone.localdate() - timezone.localtime(original_sale.created_at).date()).days
    if age_days > window and not override_window:
        raise ValidationError(
            f"Sale is {age_days} days old (window {window}). Needs a manager override."
        )
    if age_days > window and override_window and not (cashier.is_manager or approved_by):
        raise ValidationError("Out-of-window override needs a manager.")

    # --- value the goods coming back ---------------------------------------
    lines_spec = []
    returned_value = 0
    sale_lines = {l.pk: l for l in original_sale.lines.select_related("variant__style")}
    for r in return_items:
        sl = sale_lines.get(r["sale_line_id"])
        if sl is None:
            raise ValidationError("Line not on this sale.")
        qty = int(r["qty"])
        if qty <= 0:
            continue
        if qty > sl.returnable_qty:
            raise ValidationError(f"{sl.description}: only {sl.returnable_qty} returnable.")
        amount = sl.refund_value_for(qty)
        returned_value += amount
        lines_spec.append((sl, qty, r.get("condition", ReturnLine.Condition.RESALEABLE),
                           r.get("reason", ReturnLine.Reason.SIZE), amount))
    if not lines_spec:
        raise ValidationError("Select at least one item to return.")

    # --- approval gate ----------------------------------------------------
    limit = settings.POS["CASHIER_DISCOUNT_LIMIT_PAISE"]
    if returned_value > limit and not cashier.is_manager and approved_by is None:
        raise ValidationError(
            f"Return value {returned_value} exceeds the cashier limit ({limit}). "
            "A manager must approve."
        )
    if approved_by is not None and not approved_by.is_manager:
        raise ValidationError("Approver must be a manager.")

    rt = ReturnTxn.objects.create(
        number=_doc_number("RET"),
        kind=kind,
        original_sale=original_sale,
        cashier=cashier,
        approved_by=approved_by,
        till_session=till_session,
        returned_value_paise=returned_value,
    )

    # --- bring the goods back in -----------------------------------------
    restock_reason = (
        StockMovement.Reason.EXCHANGE_IN if kind == ReturnTxn.Kind.EXCHANGE
        else StockMovement.Reason.RETURN
    )
    for sl, qty, condition, reason, amount in lines_spec:
        ReturnLine.objects.create(
            return_txn=rt, sale_line=sl, qty=qty,
            condition=condition, reason=reason, amount_paise=amount,
        )
        sl.returned_qty += qty
        sl.save(update_fields=["returned_qty"])
        variant = Variant.objects.select_for_update().get(pk=sl.variant_id)
        if condition == ReturnLine.Condition.RESALEABLE:
            _move_stock(variant, qty, restock_reason, rt.number, cashier)
        else:
            _move_stock(variant, 0, StockMovement.Reason.WRITE_OFF, rt.number, cashier,
                        note="returned damaged - quarantined, not restocked")

    # --- money ----------------------------------------------------------
    if kind == ReturnTxn.Kind.REFUND:
        rt.refund_method = refund_method if refund_method != TenderMethod.NONE else _guess_tender(original_sale)
        rt.refund_amount_paise = returned_value
        if rt.refund_method == TenderMethod.CASH and till_session:
            _add_cash_movement(till_session, "CASH_REFUND", returned_value, rt.number)

    else:  # EXCHANGE
        if not exchange_items:
            raise ValidationError("An exchange needs replacement item(s).")
        ex_locked = _lock_variants(r["variant_id"] for r in exchange_items)
        ex_quote_items = []
        for r in exchange_items:
            v = ex_locked.get(r["variant_id"])
            if v is None or not v.is_sellable:
                raise ValidationError("Bad replacement variant.")
            if v.stock < r["qty"]:
                raise ValidationError(f"{v.label}: only {v.stock} in stock.")
            ex_quote_items.append({"variant": v, "qty": r["qty"]})

        exq = build_quote(ex_quote_items, on_date)
        exchange_sale = _write_sale_from_quote(exq, cashier, till_session, is_exchange=True)
        rt.exchange_sale = exchange_sale
        for ln in exq.lines:
            _move_stock(ex_locked[ln.variant_id], -ln.qty,
                        StockMovement.Reason.EXCHANGE_OUT, rt.number, cashier)

        # the returned goods act as a trade-in credit against the new sale
        trade_in = min(exq.total_paise, returned_value)
        Payment.objects.create(
            sale=exchange_sale, method=TenderMethod.STORE_CREDIT,
            amount_paise=trade_in, ref=f"trade-in {rt.number}",
        )

        diff = exq.total_paise - returned_value
        if diff > 0:            # customer pays the difference
            rt.collect_amount_paise = diff
            Payment.objects.create(
                sale=exchange_sale, method=collect_method, amount_paise=diff,
                ref=f"exchange top-up {rt.number}",
            )
            if collect_method == TenderMethod.CASH and till_session:
                _add_cash_movement(till_session, "EXCHANGE_COLLECT", diff, rt.number)
        elif diff < 0:          # store refunds the difference
            rt.refund_amount_paise = -diff
            rt.refund_method = refund_method if refund_method != TenderMethod.NONE else _guess_tender(original_sale)
            if rt.refund_method == TenderMethod.CASH and till_session:
                _add_cash_movement(till_session, "CASH_REFUND", -diff, rt.number)

    rt.save()
    original_sale.recompute_status()
    return rt


def _guess_tender(sale: Sale) -> str:
    p = sale.payments.exclude(method=TenderMethod.STORE_CREDIT).first()
    return p.method if p else TenderMethod.CASH


def _add_cash_movement(till_session, mtype, amount, ref):
    # imported lazily to avoid a circular import at module load
    from till.models import CashMovement

    CashMovement.objects.create(session=till_session, type=mtype, amount_paise=amount, ref=ref)
