from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    is_manager = serializers.BooleanField(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "role", "is_manager"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={"input_type": "password"})
