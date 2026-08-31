"""
Cash management (Branch 3).

One TillSession is OPEN at a time. Every cash movement in or out is recorded, so
at close we can compare the *expected* drawer to a *blind* physical count and
force a reason + manager sign-off when the variance is outside tolerance.
"""
from django.conf import settings
from django.db import models


class TillSession(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    opened_at = models.DateTimeField(auto_now_add=True)
    opening_float_paise = models.PositiveIntegerField()

    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_paise = models.IntegerField(null=True, blank=True)
    counted_paise = models.IntegerField(null=True, blank=True)
    variance_paise = models.IntegerField(null=True, blank=True)
    count_note = models.TextField(blank=True)
    signed_off_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-opened_at"]

    def __str__(self):
        return f"Till #{self.pk} ({self.status})"


class CashMovement(models.Model):
    class Type(models.TextChoices):
        CASH_SALE = "CASH_SALE", "Cash sale"
        CASH_REFUND = "CASH_REFUND", "Cash refund"
        EXCHANGE_COLLECT = "EXCHANGE_COLLECT", "Exchange top-up collected"
        PAID_OUT = "PAID_OUT", "Paid out / petty cash"
        SAFE_DROP = "SAFE_DROP", "Safe drop"

    session = models.ForeignKey(TillSession, on_delete=models.CASCADE, related_name="movements")
    type = models.CharField(max_length=16, choices=Type.choices)
    amount_paise = models.PositiveIntegerField()
    ref = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # movement types that ADD cash to the drawer; the rest remove it
    INFLOW = {Type.CASH_SALE, Type.EXCHANGE_COLLECT}

    class Meta:
        ordering = ["-created_at"]

    @property
    def signed_paise(self) -> int:
        return self.amount_paise if self.type in self.INFLOW else -self.amount_paise

    def __str__(self):
        return f"{self.type} {self.amount_paise}"
