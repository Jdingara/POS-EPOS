"""
The pricing engine. Pure functions - no DB writes - so it is easy to test and
easy to reason about.

Key apparel rule: the MRP is GST-INCLUSIVE. So for every line we:
  1. take gross      = unit_price * qty          (tax-inclusive)
  2. find the best promo % for the style, in the date window
  3. discount        = round(gross * pct/100), capped by the promo
  4. net             = gross - discount          (what the customer pays, tax-inclusive)
  5. back out tax:   taxable = round(net * 100 / (100 + rate)); tax = net - taxable

Totals: subtotal = sum(gross), discount = sum(line discount), tax = sum(line tax),
total = sum(net) = subtotal - discount.
"""
from dataclasses import dataclass, field
from datetime import date

from .models import Promotion, Variant


def _round(x: float) -> int:
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


@dataclass
class QuoteLine:
    variant_id: int
    barcode: str
    label: str
    qty: int
    unit_price_paise: int
    gross_paise: int
    promo_id: int | None
    promo_name: str
    discount_paise: int
    taxable_paise: int
    tax_rate: int
    tax_paise: int
    line_total_paise: int


@dataclass
class Quote:
    lines: list[QuoteLine] = field(default_factory=list)
    subtotal_paise: int = 0
    discount_paise: int = 0
    taxable_paise: int = 0
    tax_paise: int = 0
    total_paise: int = 0
    tax_breakup: dict = field(default_factory=dict)  # {"5": {"taxable":..,"tax":..}}


def best_promo_for(style, on_date: date):
    """Highest-percent promotion that is in-window and applies to this style.

    v1 has a handful of promotions, so a full scan is fine and readable. If this
    ever grew we would pre-filter by scope in SQL.
    """
    best = None
    for promo in Promotion.objects.filter(active=True):
        if not promo.window_ok(on_date):
            continue
        if not promo.applies_to_style(style):
            continue
        if best is None or promo.percent > best.percent:
            best = promo
    return best


def quote(items: list[dict], on_date: date) -> Quote:
    """
    items: [{"variant": <Variant or id>, "qty": int}]
    Returns a Quote with every line priced, discounted and taxed.
    """
    q = Quote()
    variant_cache: dict[int, Variant] = {}

    for row in items:
        v = row["variant"]
        if not isinstance(v, Variant):
            v = variant_cache.get(v) or Variant.objects.select_related("style").get(pk=v)
        variant_cache[v.pk] = v
        qty = int(row["qty"])
        if qty <= 0:
            continue

        unit = v.unit_price_paise
        gross = unit * qty

        promo = best_promo_for(v.style, on_date)
        discount = 0
        if promo and qty >= promo.min_qty:
            discount = _round(gross * promo.percent / 100)
            if promo.max_discount_paise is not None:
                discount = min(discount, promo.max_discount_paise)
        else:
            promo = None

        net = gross - discount
        rate = v.style.tax_rate_for(unit)
        taxable = _round(net * 100 / (100 + rate))
        tax = net - taxable

        q.lines.append(
            QuoteLine(
                variant_id=v.pk,
                barcode=v.barcode,
                label=v.label,
                qty=qty,
                unit_price_paise=unit,
                gross_paise=gross,
                promo_id=promo.pk if promo else None,
                promo_name=promo.name if promo else "",
                discount_paise=discount,
                taxable_paise=taxable,
                tax_rate=rate,
                tax_paise=tax,
                line_total_paise=net,
            )
        )

        q.subtotal_paise += gross
        q.discount_paise += discount
        q.taxable_paise += taxable
        q.tax_paise += tax
        q.total_paise += net

        key = str(rate)
        bucket = q.tax_breakup.setdefault(key, {"taxable_paise": 0, "tax_paise": 0})
        bucket["taxable_paise"] += taxable
        bucket["tax_paise"] += tax

    return q
