import re
import html as html_module
from rest_framework import serializers
from .models import Producto, Categoria, Kit, KitComponente


def limpiar_texto(value):
    if not value:
        return value
    value = str(value).strip()
    value = re.sub(r'<[^>]*>', '', value)
    value = html_module.unescape(value)
    value = re.sub(r'javascript\s*:', '', value, flags=re.IGNORECASE)
    return value.strip()


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ['id', 'nombre', 'descripcion', 'activa']

    def validate_nombre(self, value):
        return limpiar_texto(value)

    def validate_descripcion(self, value):
        return limpiar_texto(value) if value else value


class KitComponenteSerializer(serializers.ModelSerializer):
    componente_nombre = serializers.CharField(source='componente.nombre', read_only=True)
    componente_codigo = serializers.CharField(source='componente.codigo', read_only=True)
    stock_actual = serializers.DecimalField(
        source='componente.inventario_actual', max_digits=12, decimal_places=3, read_only=True
    )

    class Meta:
        model = KitComponente
        fields = ['id', 'componente', 'componente_nombre', 'componente_codigo', 'cantidad', 'stock_actual']


class ProductoSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)
    disponible = serializers.BooleanField(read_only=True)
    stock_bajo = serializers.BooleanField(read_only=True)
    stock_sobre = serializers.BooleanField(read_only=True)
    kit_componentes = serializers.SerializerMethodField()
    inventario_actual = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = [
            'id', 'codigo', 'nombre', 'tipo', 'categoria', 'categoria_nombre',
            'precio_costo', 'porcentaje_ganancia', 'precio_venta',
            'precio_mayoreo', 'mayoreo_minimo',
            'inventario_actual', 'inventario_minimo', 'inventario_maximo',
            'disponible', 'stock_bajo', 'stock_sobre', 'activo', 'usa_inventario',
            'kit_componentes'
        ]

    def get_inventario_actual(self, obj):
        if obj.tipo == 'kit':
            return obj.get_stock_kit()
        return obj.inventario_actual

    def validate_nombre(self, value):
        return limpiar_texto(value)

    def validate_codigo(self, value):
        return limpiar_texto(value) if value else value

    def get_kit_componentes(self, obj):
        if obj.tipo == 'kit' and hasattr(obj, 'kit'):
            return KitComponenteSerializer(
                obj.kit.componentes.select_related('componente').all(), many=True
            ).data
        return []