import re
import html as html_module
from rest_framework import serializers
from .models import Usuario, Rol, Permiso


def limpiar_texto(value: str) -> str:
    """Elimina etiquetas HTML y patrones peligrosos del texto de entrada."""
    if not value:
        return value
    value = str(value).strip()
    value = re.sub(r'<[^>]*>', '', value)           # quitar tags HTML
    value = html_module.unescape(value)              # decodificar entidades
    value = re.sub(r'javascript\s*:', '', value, flags=re.IGNORECASE)
    value = re.sub(r'on\w+\s*=\s*["\']', '', value, flags=re.IGNORECASE)
    return value.strip()


class PermisoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permiso
        fields = ['id', 'codigo', 'descripcion']


class RolSerializer(serializers.ModelSerializer):
    permisos = PermisoSerializer(many=True, read_only=True)
    permisos_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Permiso.objects.all(),
        source='permisos', write_only=True, required=False
    )

    class Meta:
        model = Rol
        fields = ['id', 'nombre', 'permisos', 'permisos_ids']


class UsuarioSerializer(serializers.ModelSerializer):
    rol_nombre = serializers.CharField(source='rol.nombre', read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=6)

    class Meta:
        model = Usuario
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'rol', 'rol_nombre',
                  'is_active', 'is_superuser', 'password']
        read_only_fields = ['id']

    def validate_username(self, value):
        return limpiar_texto(value)

    def validate_first_name(self, value):
        return limpiar_texto(value) if value else value

    def validate_last_name(self, value):
        return limpiar_texto(value) if value else value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = Usuario(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
