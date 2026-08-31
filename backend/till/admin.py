from django.contrib import admin

from .models import CashMovement, TillSession


class CashMovementInline(admin.TabularInline):
    model = CashMovement
    extra = 0


@admin.register(TillSession)
class TillSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "opened_by", "opened_at", "opening_float_paise",
                    "closed_at", "expected_paise", "counted_paise", "variance_paise")
    list_filter = ("status",)
    inlines = [CashMovementInline]
