"""
Sales, returns and exchanges.

Rules of the house:
  - A COMPLETED sale is immutable. A return never edits or deletes it; it records
    a separate ReturnTxn and bumps SaleLine.returned_qty.
  - An exchange is modelled as a ReturnTxn that also points at a brand-new Sale
    (the replacement items). Even swap => refund_amount 0 and collect_amount 0.
  - Money is paise (int).
"""
from django.conf import settings
from django.db import models


class TenderMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    CARD = "CARD", "Card"
    UPI = "UPI", "UPI"
    STORE_CREDIT = "STORE_CREDIT", "Store credit"
    NONE = "NONE", "No tender (even exchange)"


class Sale(models.Model):
    class Status(models.TextChoices):
        COMPLETED = "COMPLETED", "Completed"
        VOIDED = "VOIDED", "Voided"
        PARTIALLY_RETURNED = "PARTIALLY_RETURNED", "Partially returned"
        RETURNED = "RETURNED", "Fully returned"

    number = models.CharField(max_length=32, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    till_session = models.ForeignKey(
        "till.TillSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    is_exchange_replacement = models.BooleanField(
        default=False, help_text="True if this Sale was created as the 'new items' side of an exchange"
    )

    subtotal_paise = models.PositiveIntegerField(default=0)
    discount_paise = models.PositiveIntegerField(default=0)
    tax_paise = models.PositiveIntegerField(default=0)
    total_paise = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number

    def recompute_status(self):
        lines = list(self.lines.all())
        if all(l.returned_qty >= l.qty for l in lines):
            self.status = self.Status.RETURNED
        elif any(l.returned_qty > 0 for l in lines):
            self.status = self.Status.PARTIALLY_RETURNED
        else:
            self.status = self.Status.COMPLETED
        self.save(update_fields=["status"])


class SaleLine(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT)
    description = models.CharField(max_length=160)  # denormalised label at time of sale
    qty = models.PositiveIntegerField()
    unit_price_paise = models.PositiveIntegerField()
    gross_paise = models.PositiveIntegerField()
    discount_paise = models.PositiveIntegerField(default=0)
    promo_name = models.CharField(max_length=80, blank=True)
    taxable_paise = models.PositiveIntegerField()
    tax_rate = models.PositiveSmallIntegerField()
    tax_paise = models.PositiveIntegerField()
    line_total_paise = models.PositiveIntegerField()
    returned_qty = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.description} x{self.qty}"

    @property
    def returnable_qty(self) -> int:
        return self.qty - self.returned_qty

    def refund_value_for(self, qty: int) -> int:
        """Proportional slice of this line's paid value (incl. tax, net of discount)."""
        if self.qty == 0:
            return 0
        return round(self.line_total_paise * qty / self.qty)


class Payment(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=14, choices=TenderMethod.choices)
    amount_paise = models.PositiveIntegerField()
    cash_received_paise = models.PositiveIntegerField(null=True, blank=True)
    change_paise = models.PositiveIntegerField(null=True, blank=True)
    ref = models.CharField(max_length=40, blank=True, help_text="UPI RRN / card auth code")

    def __str__(self):
        return f"{self.method} {self.amount_paise}"


class ReturnTxn(models.Model):
    class Kind(models.TextChoices):
        REFUND = "REFUND", "Refund"
        EXCHANGE = "EXCHANGE", "Exchange"

    number = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    original_sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    exchange_sale = models.OneToOneField(
        Sale, on_delete=models.SET_NULL, null=True, blank=True, related_name="from_exchange"
    )
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    till_session = models.ForeignKey(
        "till.TillSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="returns"
    )

    returned_value_paise = models.PositiveIntegerField(default=0, help_text="value of items coming back")
    refund_method = models.CharField(max_length=14, choices=TenderMethod.choices, default=TenderMethod.NONE)
    refund_amount_paise = models.PositiveIntegerField(default=0, help_text="money paid back to customer")
    collect_amount_paise = models.PositiveIntegerField(default=0, help_text="money collected (uneven exchange, new > old)")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


class ReturnLine(models.Model):
    class Condition(models.TextChoices):
        RESALEABLE = "RESALEABLE", "Resaleable - restock"
        DAMAGED = "DAMAGED", "Damaged - write off"

    class Reason(models.TextChoices):
        SIZE = "SIZE", "Wrong size"
        FIT = "FIT", "Poor fit"
        DEFECT = "DEFECT", "Defective"
        CHANGED_MIND = "CHANGED_MIND", "Changed mind"
        WRONG_ITEM = "WRONG_ITEM", "Wrong item"

    return_txn = models.ForeignKey(ReturnTxn, on_delete=models.CASCADE, related_name="lines")
    sale_line = models.ForeignKey(SaleLine, on_delete=models.PROTECT)
    qty = models.PositiveIntegerField()
    condition = models.CharField(max_length=12, choices=Condition.choices, default=Condition.RESALEABLE)
    reason = models.CharField(max_length=14, choices=Reason.choices, default=Reason.SIZE)
    amount_paise = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.sale_line.description} x{self.qty} ({self.reason})"
