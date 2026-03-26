from rest_framework import serializers
from .models import Venta, DetalleVenta, Ticket, PagoTicket
from productos.serializers import ProductoSerializer


class DetalleVentaSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.SerializerMethodField()
    producto_tipo = serializers.SerializerMethodField()
    producto_codigo = serializers.SerializerMethodField()
    inventario_actual = serializers.SerializerMethodField()
    precio_mayoreo = serializers.SerializerMethodField()
    minimo_mayoreo = serializers.SerializerMethodField()
    precio_costo = serializers.SerializerMethodField()

    class Meta:
        model = DetalleVenta
        fields = [
            'id', 'producto', 'producto_nombre', 'producto_tipo',
            'producto_codigo', 'inventario_actual',
            'precio_mayoreo', 'minimo_mayoreo', 'precio_costo',
            'es_producto_comun', 'producto_comun_nombre',
            'cantidad', 'precio_unitario', 'precio_tipo', 'subtotal'
        ]
        read_only_fields = ['precio_unitario', 'precio_tipo', 'subtotal']

    def get_producto_nombre(self, obj):
        if obj.es_producto_comun:
            return obj.producto_comun_nombre
        return obj.producto.nombre if obj.producto else ''

    def get_producto_tipo(self, obj):
        if obj.es_producto_comun:
            return 'comun'
        return obj.producto.tipo if obj.producto else ''

    def get_producto_codigo(self, obj):
        if obj.es_producto_comun or not obj.producto:
            return '-'
        return obj.producto.codigo or '-'

    def get_inventario_actual(self, obj):
        if obj.es_producto_comun or not obj.producto:
            return None
        if obj.producto.tipo == 'kit':
            return obj.producto.get_stock_kit()
        return obj.producto.inventario_actual

    def get_precio_mayoreo(self, obj):
        if obj.es_producto_comun or not obj.producto:
            return 0
        return obj.producto.precio_mayoreo or 0

    def get_minimo_mayoreo(self, obj):
        if obj.es_producto_comun or not obj.producto:
            return 0
        return obj.producto.mayoreo_minimo or 0

    def get_precio_costo(self, obj):
        if obj.es_producto_comun or not obj.producto:
            return 0
        return float(obj.producto.precio_costo or 0)


class AgregarItemSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
    cantidad = serializers.DecimalField(max_digits=10, decimal_places=3)
    usar_precio_mayoreo = serializers.BooleanField(default=False)


class PagoTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = PagoTicket
        fields = [
            'id', 'metodo', 'monto_total', 'monto_efectivo',
            'monto_tarjeta', 'monto_recibido', 'vuelto',
            'cliente_credito', 'fecha'
        ]


class TicketSerializer(serializers.ModelSerializer):
    pagos = PagoTicketSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = ['id', 'numero', 'generado', 'pagos']


class VentaSerializer(serializers.ModelSerializer):
    items = DetalleVentaSerializer(many=True, read_only=True)
    usuario_nombre = serializers.CharField(source='usuario.username', read_only=True)
    ticket = TicketSerializer(read_only=True)
    cliente_factura_id       = serializers.SerializerMethodField()
    cliente_factura_nombre   = serializers.SerializerMethodField()
    cliente_factura_rut      = serializers.SerializerMethodField()
    cliente_factura_correo   = serializers.SerializerMethodField()
    cliente_factura_telefono = serializers.SerializerMethodField()

    class Meta:
        model = Venta
        fields = [
            'id', 'usuario', 'usuario_nombre', 'cliente_credito',
            'cliente_factura', 'cliente_factura_id',
            'cliente_factura_nombre', 'cliente_factura_rut',
            'cliente_factura_correo', 'cliente_factura_telefono',
            'estado', 'es_credito', 'total',
            'notas', 'creada', 'items', 'ticket'
        ]
        read_only_fields = ['total', 'usuario']

    def get_cliente_factura_id(self, obj):
        return obj.cliente_factura.id if obj.cliente_factura else None

    def get_cliente_factura_nombre(self, obj):
        return obj.cliente_factura.nombre if obj.cliente_factura else None

    def get_cliente_factura_rut(self, obj):
        return obj.cliente_factura.rut if obj.cliente_factura else None

    def get_cliente_factura_correo(self, obj):
        return obj.cliente_factura.correo if obj.cliente_factura else None

    def get_cliente_factura_telefono(self, obj):
        return obj.cliente_factura.telefono if obj.cliente_factura else None


class ConfirmarVentaSerializer(serializers.Serializer):
    metodo = serializers.ChoiceField(choices=['efectivo', 'tarjeta', 'mixto', 'credito'])
    monto_recibido = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    monto_tarjeta = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    cliente_credito_id = serializers.IntegerField(required=False, allow_null=True)