from rest_framework import serializers

from .models import Payment, ReturnLine, ReturnTxn, Sale, SaleLine, TenderMethod


# --------------------------------------------------------------------------- #
#  read
# --------------------------------------------------------------------------- #
class SaleLineSerializer(serializers.ModelSerializer):
    returnable_qty = serializers.IntegerField(read_only=True)

    class Meta:
        model = SaleLine
        fields = [
            "id", "variant", "description", "qty", "unit_price_paise",
            "gross_paise", "discount_paise", "promo_name", "taxable_paise",
            "tax_rate", "tax_paise", "line_total_paise", "returned_qty", "returnable_qty",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["method", "amount_paise", "cash_received_paise", "change_paise", "ref"]


class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    cashier_name = serializers.CharField(source="cashier.username", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id", "number", "status", "cashier_name", "is_exchange_replacement",
            "subtotal_paise", "discount_paise", "tax_paise", "total_paise",
            "created_at", "lines", "payments",
        ]


class SaleListSerializer(serializers.ModelSerializer):
    tender = serializers.SerializerMethodField()
    units = serializers.SerializerMethodField()
    returned_units = serializers.SerializerMethodField()
    cashier_name = serializers.CharField(source="cashier.username", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "number", "status", "created_at", "cashier_name", "units",
            "subtotal_paise", "discount_paise", "tax_paise", "total_paise",
            "tender", "returned_units", "is_exchange_replacement",
        ]

    def get_tender(self, obj):
        p = obj.payments.exclude(method=TenderMethod.STORE_CREDIT).first()
        return p.method if p else "STORE_CREDIT"

    def get_units(self, obj):
        return sum(l.qty for l in obj.lines.all())

    def get_returned_units(self, obj):
        return sum(l.returned_qty for l in obj.lines.all())


class ReturnListSerializer(serializers.ModelSerializer):
    original_number = serializers.CharField(source="original_sale.number", read_only=True)
    exchange_number = serializers.CharField(source="exchange_sale.number", read_only=True, default=None)
    cashier_name = serializers.CharField(source="cashier.username", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.username", read_only=True, default=None)
    units = serializers.SerializerMethodField()

    class Meta:
        model = ReturnTxn
        fields = [
            "number", "kind", "created_at", "original_number", "exchange_number",
            "cashier_name", "approved_by_name", "units", "returned_value_paise",
            "refund_method", "refund_amount_paise", "collect_amount_paise",
        ]

    def get_units(self, obj):
        return sum(l.qty for l in obj.lines.all())


class ReturnLineSerializer(serializers.ModelSerializer):
    description = serializers.CharField(source="sale_line.description", read_only=True)

    class Meta:
        model = ReturnLine
        fields = ["sale_line", "description", "qty", "condition", "reason", "amount_paise"]


class ReturnTxnSerializer(serializers.ModelSerializer):
    lines = ReturnLineSerializer(many=True, read_only=True)
    original_number = serializers.CharField(source="original_sale.number", read_only=True)
    exchange_number = serializers.CharField(source="exchange_sale.number", read_only=True, default=None)
    cashier_name = serializers.CharField(source="cashier.username", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.username", read_only=True, default=None)

    class Meta:
        model = ReturnTxn
        fields = [
            "number", "kind", "original_number", "exchange_number",
            "cashier_name", "approved_by_name", "returned_value_paise",
            "refund_method", "refund_amount_paise", "collect_amount_paise",
            "created_at", "lines",
        ]


# --------------------------------------------------------------------------- #
#  write
# --------------------------------------------------------------------------- #
class CartItemSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField()
    qty = serializers.IntegerField(min_value=1)


class QuoteRequestSerializer(serializers.Serializer):
    items = CartItemSerializer(many=True)


class PaymentInSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=[TenderMethod.CASH, TenderMethod.CARD, TenderMethod.UPI])
    amount_paise = serializers.IntegerField(min_value=1)
    cash_received_paise = serializers.IntegerField(required=False, allow_null=True)
    ref = serializers.CharField(required=False, allow_blank=True, default="")


class CheckoutSerializer(serializers.Serializer):
    items = CartItemSerializer(many=True)
    payments = PaymentInSerializer(many=True)


class ReturnItemSerializer(serializers.Serializer):
    sale_line_id = serializers.IntegerField()
    qty = serializers.IntegerField(min_value=1)
    condition = serializers.ChoiceField(
        choices=ReturnLine.Condition.choices, default=ReturnLine.Condition.RESALEABLE
    )
    reason = serializers.ChoiceField(
        choices=ReturnLine.Reason.choices, default=ReturnLine.Reason.SIZE
    )


class ReturnRequestSerializer(serializers.Serializer):
    original_number = serializers.CharField()
    kind = serializers.ChoiceField(choices=ReturnTxn.Kind.choices)
    return_items = ReturnItemSerializer(many=True)
    refund_method = serializers.ChoiceField(
        choices=TenderMethod.choices, required=False, default=TenderMethod.NONE
    )
    exchange_items = CartItemSerializer(many=True, required=False, default=list)
    collect_method = serializers.ChoiceField(
        choices=[TenderMethod.CASH, TenderMethod.CARD, TenderMethod.UPI],
        required=False, default=TenderMethod.UPI,
    )
    approved_by_id = serializers.IntegerField(required=False, allow_null=True)
    override_window = serializers.BooleanField(required=False, default=False)
