from rest_framework import serializers

from .models import CashMovement, TillSession


class CashMovementSerializer(serializers.ModelSerializer):
    signed_paise = serializers.IntegerField(read_only=True)

    class Meta:
        model = CashMovement
        fields = ["id", "type", "amount_paise", "signed_paise", "ref", "note", "created_at"]


class TillSessionSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.CharField(source="opened_by.get_full_name", read_only=True)
    movements = CashMovementSerializer(many=True, read_only=True)

    class Meta:
        model = TillSession
        fields = [
            "id", "status", "opened_by_name", "opened_at", "opening_float_paise",
            "closed_at", "expected_paise", "counted_paise", "variance_paise",
            "count_note", "movements",
        ]


class OpenTillSerializer(serializers.Serializer):
    opening_float_paise = serializers.IntegerField(min_value=0)


class MovementInSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=[CashMovement.Type.PAID_OUT, CashMovement.Type.SAFE_DROP]
    )
    amount_paise = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class CloseTillSerializer(serializers.Serializer):
    counted_paise = serializers.IntegerField(min_value=0)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    signed_off_by_id = serializers.IntegerField(required=False, allow_null=True)
