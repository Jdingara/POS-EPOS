from django.contrib import admin

from .models import Payment, ReturnLine, ReturnTxn, Sale, SaleLine


class SaleLineInline(admin.TabularInline):
    model = SaleLine
    extra = 0
    readonly_fields = [f.name for f in SaleLine._meta.fields if f.name != "id"]
    can_delete = False


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("number", "created_at", "status", "cashier", "total_paise", "is_exchange_replacement")
    list_filter = ("status", "is_exchange_replacement")
    search_fields = ("number",)
    inlines = [SaleLineInline, PaymentInline]


class ReturnLineInline(admin.TabularInline):
    model = ReturnLine
    extra = 0


@admin.register(ReturnTxn)
class ReturnTxnAdmin(admin.ModelAdmin):
    list_display = ("number", "created_at", "kind", "original_sale", "returned_value_paise",
                    "refund_amount_paise", "collect_amount_paise", "approved_by")
    list_filter = ("kind",)
    search_fields = ("number", "original_sale__number")
    inlines = [ReturnLineInline]
