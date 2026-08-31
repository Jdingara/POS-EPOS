from django.contrib import admin

from .models import Brand, Category, Promotion, StockMovement, Style, Variant


class VariantInline(admin.TabularInline):
    model = Variant
    extra = 0


@admin.register(Style)
class StyleAdmin(admin.ModelAdmin):
    list_display = ("style_code", "name", "brand", "category", "season", "mrp_paise", "is_active")
    list_filter = ("brand", "category", "season", "is_active")
    search_fields = ("style_code", "name")
    inlines = [VariantInline]


@admin.register(Variant)
class VariantAdmin(admin.ModelAdmin):
    list_display = ("barcode", "style", "color", "size", "stock", "is_sellable")
    list_filter = ("style__brand", "style__category", "is_sellable")
    search_fields = ("barcode", "style__name", "style__style_code")


@admin.register(Promotion)
class PromotionAdmin(admin.ModelAdmin):
    list_display = ("name", "scope", "percent", "starts_on", "ends_on", "active")
    list_filter = ("scope", "active")
    filter_horizontal = ("styles",)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("created_at", "variant", "delta", "reason", "ref", "created_by")
    list_filter = ("reason",)
    search_fields = ("variant__barcode", "ref")


admin.site.register(Category)
admin.site.register(Brand)
