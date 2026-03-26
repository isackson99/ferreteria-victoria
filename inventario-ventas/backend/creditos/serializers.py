from rest_framework import serializers
from .models import CuentaCredito, MovimientoCredito


class MovimientoCreditoSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.username', read_only=True)
    ticket_numero = serializers.CharField(source='ticket.numero', read_only=True)

    class Meta:
        model = MovimientoCredito
        fields = [
            'id', 'tipo', 'monto', 'ticket', 'ticket_numero',
            'usuario', 'usuario_nombre', 'metodo_pago', 'notas', 'fecha',
        ]
        read_only_fields = ['usuario']


class CuentaCreditoSerializer(serializers.ModelSerializer):
    cliente_id = serializers.IntegerField(source='cliente.id', read_only=True)
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    cliente_direccion = serializers.CharField(source='cliente.direccion', read_only=True)
    cliente_telefono = serializers.CharField(source='cliente.telefono', read_only=True)
    limite_credito = serializers.DecimalField(
        source='cliente.credito_maximo', max_digits=12, decimal_places=2,
        read_only=True, allow_null=True,
    )
    credito_ilimitado = serializers.BooleanField(source='cliente.credito_ilimitado', read_only=True)
    saldo_disponible = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    porcentaje_uso = serializers.FloatField(read_only=True)
    ultimo_pago = serializers.SerializerMethodField()

    class Meta:
        model = CuentaCredito
        fields = [
            'id', 'cliente', 'cliente_id', 'cliente_nombre', 'cliente_direccion',
            'cliente_telefono', 'limite_credito', 'credito_ilimitado',
            'saldo_usado', 'saldo_disponible', 'porcentaje_uso', 'ultimo_pago',
        ]

    def get_ultimo_pago(self, obj):
        ultimo = obj.movimientos.filter(tipo='abono').first()
        return ultimo.fecha.isoformat() if ultimo else None


class AbonoSerializer(serializers.Serializer):
    monto = serializers.DecimalField(max_digits=12, decimal_places=2)
    metodo_pago = serializers.ChoiceField(
        choices=['efectivo', 'tarjeta', 'transferencia'],
        default='efectivo',
        required=False,
    )
    notas = serializers.CharField(required=False, allow_blank=True)
