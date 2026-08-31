"""
Catalog + inventory + promotions.

The apparel-specific idea (see docs/02-product-brief.md) is that a garment is not
one SKU. A *Style* ("Men's Oxford Shirt") owns a matrix of *Variants*
(size x colour), and it is the Variant that has a barcode and a stock figure and
is what actually gets scanned at the till.

Money is stored in paise (integer) everywhere. Rupees only exist at the edges
(seed data, receipts, the UI).
"""
from django.conf import settings
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=60, unique=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=60, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Style(models.Model):
    """A garment design. Carries the tag price (MRP, tax-inclusive) and tax data."""

    style_code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="styles")
    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name="styles")
    season = models.CharField(max_length=24, blank=True, help_text="e.g. AW25, SS25, Core")
    hsn = models.CharField(max_length=8, default="6109", help_text="GST HSN code")

    # MRP is what is printed on the swing tag - GST inclusive. A permanent
    # markdown is a *price change*: you lower this number (and re-tag). That is a
    # different thing from a Promotion, which is a till-time rule. Keeping them
    # separate keeps margin reporting honest.
    mrp_paise = models.PositiveIntegerField()

    # Optional override; if null the rate is derived from the per-piece value
    # (5% at or below Rs 1,000, 12% above - the well-known apparel GST rule).
    tax_rate_override = models.PositiveSmallIntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["style_code"]

    def __str__(self):
        return f"{self.style_code}  {self.name}"

    def tax_rate_for(self, unit_price_paise: int) -> int:
        if self.tax_rate_override is not None:
            return self.tax_rate_override
        threshold = settings.POS["GST_PIECE_THRESHOLD_PAISE"]
        return (
            settings.POS["GST_RATE_LOW"]
            if unit_price_paise <= threshold
            else settings.POS["GST_RATE_HIGH"]
        )


class Variant(models.Model):
    """One sellable unit: a Style in a specific size + colour."""

    style = models.ForeignKey(Style, on_delete=models.CASCADE, related_name="variants")
    size = models.CharField(max_length=12)
    color = models.CharField(max_length=24)
    barcode = models.CharField(max_length=32, unique=True)

    # Usually null -> the Variant sells at style.mrp_paise. Set only if a specific
    # size/colour is priced differently.
    price_paise = models.PositiveIntegerField(null=True, blank=True)

    stock = models.IntegerField(default=0)
    is_sellable = models.BooleanField(default=True)

    class Meta:
        unique_together = ("style", "size", "color")
        ordering = ["style__style_code", "color", "size"]

    def __str__(self):
        return f"{self.style.name} / {self.color} / {self.size}"

    @property
    def unit_price_paise(self) -> int:
        return self.price_paise if self.price_paise is not None else self.style.mrp_paise

    @property
    def label(self) -> str:
        return f"{self.style.name} - {self.color} - {self.size}"


class StockMovement(models.Model):
    """Append-only ledger of every change to a variant's stock."""

    class Reason(models.TextChoices):
        SALE = "SALE", "Sale"
        RETURN = "RETURN", "Customer return (restock)"
        RECEIVE = "RECEIVE", "Goods received"
        WRITE_OFF = "WRITE_OFF", "Damage / write-off"
        CORRECTION = "CORRECTION", "Manual correction"
        EXCHANGE_OUT = "EXCHANGE_OUT", "Exchange - item given out"
        EXCHANGE_IN = "EXCHANGE_IN", "Exchange - item taken back"

    variant = models.ForeignKey(Variant, on_delete=models.PROTECT, related_name="movements")
    delta = models.IntegerField(help_text="signed change in units")
    reason = models.CharField(max_length=16, choices=Reason.choices)
    ref = models.CharField(max_length=40, blank=True, help_text="receipt / return number")
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.variant.barcode} {self.delta:+d} ({self.reason})"


class Promotion(models.Model):
    """
    A till-time discount rule. v1 supports one shape only: a flat % off a set of
    styles, chosen by category / brand / explicit list, inside a date window.
    (BOGO / bundles are v2 - the brief explains why.)
    """

    class Scope(models.TextChoices):
        ALL = "ALL", "Whole store"
        CATEGORY = "CATEGORY", "Category"
        BRAND = "BRAND", "Brand"
        STYLES = "STYLES", "Specific styles"

    name = models.CharField(max_length=80)
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.CATEGORY)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, null=True, blank=True)
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, null=True, blank=True)
    styles = models.ManyToManyField(Style, blank=True, related_name="promotions")

    percent = models.PositiveSmallIntegerField(help_text="e.g. 30 = 30% off")
    starts_on = models.DateField()
    ends_on = models.DateField()
    min_qty = models.PositiveSmallIntegerField(default=1)
    max_discount_paise = models.PositiveIntegerField(
        null=True, blank=True, help_text="optional cap per line"
    )
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-percent", "name"]

    def __str__(self):
        return f"{self.name} ({self.percent}% off)"

    def window_ok(self, on_date) -> bool:
        return self.active and self.starts_on <= on_date <= self.ends_on

    def applies_to_style(self, style: Style) -> bool:
        if self.scope == self.Scope.ALL:
            return True
        if self.scope == self.Scope.CATEGORY:
            return self.category_id == style.category_id
        if self.scope == self.Scope.BRAND:
            return self.brand_id == style.brand_id
        if self.scope == self.Scope.STYLES:
            return self.styles.filter(pk=style.pk).exists()
        return False
