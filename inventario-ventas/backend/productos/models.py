import math
from django.db import models
from django.core.exceptions import ValidationError


class Categoria(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    activa = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name_plural = "Categorías"


class Producto(models.Model):
    TIPO_CHOICES = [
        ('unidad', 'Unidad'),
        ('granel', 'Granel'),
        ('kit', 'Kit'),
    ]

    codigo = models.CharField(max_length=50, unique=True)
    nombre = models.CharField(max_length=200)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES, default='unidad')
    categoria = models.ForeignKey(Categoria, on_delete=models.SET_NULL, null=True, blank=True, related_name='productos')
    precio_costo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    porcentaje_ganancia = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    precio_venta = models.DecimalField(max_digits=12, decimal_places=2)
    precio_mayoreo = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    mayoreo_minimo = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    inventario_actual = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    inventario_minimo = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    inventario_maximo = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    activo = models.BooleanField(default=True)
    usa_inventario = models.BooleanField(default=True)
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.precio_venta is not None and self.precio_venta <= 0:
            raise ValidationError({'precio_venta': 'El precio de venta debe ser mayor a 0.'})
        if self.precio_mayoreo and not self.mayoreo_minimo:
            raise ValidationError({'mayoreo_minimo': 'Debes definir una cantidad mínima para el precio mayoreo.'})
        if self.mayoreo_minimo and not self.precio_mayoreo:
            raise ValidationError({'precio_mayoreo': 'Debes definir un precio mayoreo si defines un mínimo.'})

    @property
    def disponible(self):
        return self.inventario_actual > 0

    @property
    def stock_bajo(self):
        return self.inventario_actual <= self.inventario_minimo

    @property
    def stock_sobre(self):
        return self.inventario_maximo > 0 and self.inventario_actual > self.inventario_maximo

    def get_stock_kit(self):
        """Calcula el stock disponible del kit según sus componentes."""
        if self.tipo != 'kit':
            return self.inventario_actual
        try:
            componentes = self.kit.componentes.select_related('componente').all()
            if not componentes.exists():
                return 0
            stocks = []
            for comp in componentes:
                if comp.cantidad <= 0:
                    continue
                kits_posibles = math.floor(
                    float(comp.componente.inventario_actual) / float(comp.cantidad)
                )
                stocks.append(kits_posibles)
            return min(stocks) if stocks else 0
        except Exception:
            return 0

    def aplica_mayoreo(self, cantidad):
        return (
            self.precio_mayoreo is not None and
            self.mayoreo_minimo is not None and
            cantidad >= self.mayoreo_minimo
        )

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()})"

    class Meta:
        verbose_name_plural = "Productos"
        ordering = ['nombre']


class Kit(models.Model):
    producto = models.OneToOneField(
        Producto, on_delete=models.CASCADE,
        related_name='kit', limit_choices_to={'tipo': 'kit'}
    )
    descripcion_promo = models.TextField(blank=True)

    def obtener_componentes_simples(self, cantidad=1):
        """Resuelve recursivamente todos los componentes simples y sus cantidades totales."""
        resultado = {}
        for comp in self.componentes.select_related('componente__kit'):
            cantidad_total = comp.cantidad * cantidad
            if comp.componente.tipo == 'kit':
                sub = comp.componente.kit.obtener_componentes_simples(cantidad_total)
                for prod_id, data in sub.items():
                    if prod_id in resultado:
                        resultado[prod_id]['cantidad'] += data['cantidad']
                    else:
                        resultado[prod_id] = data
            else:
                if comp.componente.id in resultado:
                    resultado[comp.componente.id]['cantidad'] += cantidad_total
                else:
                    resultado[comp.componente.id] = {
                        'producto': comp.componente,
                        'cantidad': cantidad_total,
                    }
        return resultado

    def __str__(self):
        return f"Kit: {self.producto.nombre}"

    class Meta:
        verbose_name_plural = "Kits"


class KitComponente(models.Model):
    kit = models.ForeignKey(Kit, on_delete=models.CASCADE, related_name='componentes')
    componente = models.ForeignKey(Producto, on_delete=models.PROTECT, related_name='usado_en_kits')
    cantidad = models.DecimalField(max_digits=10, decimal_places=3)

    def clean(self):
        if self.kit.producto == self.componente:
            raise ValidationError('Un kit no puede contenerse a sí mismo.')

    def __str__(self):
        return f"{self.cantidad}x {self.componente.nombre} en {self.kit}"

    class Meta:
        verbose_name_plural = "Componentes de Kit"
        unique_together = ['kit', 'componente']
        
class MovimientoInventario(models.Model):
    TIPO_CHOICES = [
        ('entrada', 'Entrada'),
        ('salida', 'Salida'),
        ('ajuste', 'Ajuste'),
        ('venta', 'Venta'),
        ('devolucion', 'Devolución'),
    ]

    producto = models.ForeignKey(Producto, on_delete=models.CASCADE, related_name='movimientos')
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    cantidad = models.DecimalField(max_digits=12, decimal_places=3)
    stock_antes = models.DecimalField(max_digits=12, decimal_places=3)
    stock_despues = models.DecimalField(max_digits=12, decimal_places=3)
    motivo = models.TextField(blank=True)
    usuario = models.ForeignKey('usuarios.Usuario', on_delete=models.SET_NULL, null=True, blank=True)
    referencia_venta = models.ForeignKey('ventas.Venta', on_delete=models.SET_NULL, null=True, blank=True)
    fecha = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.get_tipo_display()} — {self.producto.nombre} ({self.cantidad}) — {self.fecha}'

    class Meta:
        verbose_name = 'Movimiento de Inventario'
        verbose_name_plural = 'Movimientos de Inventario'
        ordering = ['-fecha']