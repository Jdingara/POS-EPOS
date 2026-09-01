from rest_framework import serializers

from .models import Brand, Category, Promotion, StockMovement, Style, Variant


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name"]


class VariantSerializer(serializers.ModelSerializer):
    unit_price_paise = serializers.IntegerField(read_only=True)
    label = serializers.CharField(read_only=True)
    style_code = serializers.CharField(source="style.style_code", read_only=True)
    style_name = serializers.CharField(source="style.name", read_only=True)

    class Meta:
        model = Variant
        fields = [
            "id", "style", "style_code", "style_name", "size", "color",
            "barcode", "price_paise", "unit_price_paise", "stock", "is_sellable", "label",
        ]
        extra_kwargs = {"barcode": {"required": False, "allow_blank": True}}


class StyleSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    variants = VariantSerializer(many=True, read_only=True)

    class Meta:
        model = Style
        fields = [
            "id", "style_code", "name", "category", "category_name",
            "brand", "brand_name", "season", "hsn", "mrp_paise",
            "tax_rate_override", "is_active", "variants",
        ]


class PromotionSerializer(serializers.ModelSerializer):
    scope_label = serializers.SerializerMethodField()

    class Meta:
        model = Promotion
        fields = [
            "id", "name", "scope", "scope_label", "category", "brand", "styles",
            "percent", "starts_on", "ends_on", "min_qty", "max_discount_paise", "active",
        ]

    def get_scope_label(self, obj):
        if obj.scope == Promotion.Scope.CATEGORY and obj.category:
            return f"Category: {obj.category.name}"
        if obj.scope == Promotion.Scope.BRAND and obj.brand:
            return f"Brand: {obj.brand.name}"
        if obj.scope == Promotion.Scope.STYLES:
            return "Selected styles"
        return "Whole store"


class StockMovementSerializer(serializers.ModelSerializer):
    variant_label = serializers.CharField(source="variant.label", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id", "variant", "variant_label", "delta", "reason", "ref",
            "note", "created_by_name", "created_at",
        ]


class StockAdjustSerializer(serializers.Serializer):
    delta = serializers.IntegerField()
    reason = serializers.ChoiceField(
        choices=[StockMovement.Reason.RECEIVE, StockMovement.Reason.WRITE_OFF,
                 StockMovement.Reason.CORRECTION]
    )
    note = serializers.CharField(required=False, allow_blank=True, default="")
