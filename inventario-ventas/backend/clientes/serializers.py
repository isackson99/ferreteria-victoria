import re
import html as html_module
from rest_framework import serializers
from .models import ClienteCredito, ClienteFactura


def limpiar_texto(value):
    if not value:
        return value
    value = str(value).strip()
    value = re.sub(r'<[^>]*>', '', value)
    value = html_module.unescape(value)
    value = re.sub(r'javascript\s*:', '', value, flags=re.IGNORECASE)
    return value.strip()


class ClienteCreditoSerializer(serializers.ModelSerializer):
    saldo_usado = serializers.DecimalField(
        source='cuenta.saldo_usado', max_digits=12,
        decimal_places=2, read_only=True, default=0
    )
    saldo_disponible = serializers.SerializerMethodField()
    porcentaje_uso = serializers.SerializerMethodField()
    cuenta_id = serializers.SerializerMethodField()

    class Meta:
        model = ClienteCredito
        fields = [
            'id', 'nombre', 'direccion', 'telefono',
            'credito_ilimitado', 'credito_maximo',
            'fecha_vencimiento', 'activo', 'precio_especial', 'saldo_usado',
            'saldo_disponible', 'porcentaje_uso', 'cuenta_id',
        ]

    def get_saldo_disponible(self, obj):
        try:
            sd = obj.cuenta.saldo_disponible
            return str(sd) if sd is not None else None
        except Exception:
            return str(obj.credito_maximo) if obj.credito_maximo else None

    def get_porcentaje_uso(self, obj):
        try:
            return round(obj.cuenta.porcentaje_uso, 1)
        except Exception:
            return 0

    def get_cuenta_id(self, obj):
        try:
            return obj.cuenta.id
        except Exception:
            return None

    def validate_nombre(self, value):
        return limpiar_texto(value)

    def validate_direccion(self, value):
        return limpiar_texto(value) if value else value

    def validate_telefono(self, value):
        return limpiar_texto(value) if value else value


class ClienteFacturaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClienteFactura
        fields = ['id', 'rut', 'nombre', 'correo', 'telefono', 'giro', 'ciudad',
                  'domicilio', 'notas', 'activo', 'creado']
        read_only_fields = ['id', 'creado']

    def validate_nombre(self, value):
        return limpiar_texto(value)

    def validate_notas(self, value):
        return limpiar_texto(value) if value else value

    def validate_giro(self, value):
        return limpiar_texto(value) if value else value
