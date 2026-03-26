from django.db import models
from django.core.exceptions import ValidationError
from usuarios.models import Usuario
from productos.models import Producto
from clientes.models import ClienteCredito, ClienteFactura


class Venta(models.Model):
    ESTADO_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('completada', 'Completada'),
        ('cancelada', 'Cancelada'),
    ]

    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name='ventas')
    cliente_credito = models.ForeignKey(ClienteCredito, on_delete=models.SET_NULL, null=True, blank=True, related_name='ventas')
    cliente_factura = models.ForeignKey(ClienteFactura, on_delete=models.SET_NULL, null=True, blank=True, related_name='ventas')
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='pendiente')
    es_credito = models.BooleanField(default=False)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notas = models.TextField(blank=True)
    creada = models.DateTimeField(auto_now_add=True)
    completada = models.DateTimeField(null=True, blank=True)

    def clean(self):
        if self.es_credito and not self.cliente_credito:
            raise ValidationError({'cliente_credito': 'Una venta a crédito requiere un cliente crédito.'})

    def calcular_total(self):
        from django.db.models import Sum
        total = self.items.aggregate(t=Sum('subtotal'))['t'] or 0
        self.total = total
        self.save(update_fields=['total'])
        return self.total

    def __str__(self):
        return f"Venta #{self.id} — {self.usuario} — {self.estado}"

    class Meta:
        verbose_name_plural = "Ventas"
        ordering = ['-creada']


class DetalleVenta(models.Model):
    PRECIO_TIPO_CHOICES = [
        ('normal', 'Normal'),
        ('mayoreo', 'Mayoreo'),
        ('kit', 'Kit'),
        ('comun', 'Producto Común'),
    ]

    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='items')
    producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        related_name='detalles_venta',
        null=True,
        blank=True
    )
    producto_comun_nombre = models.CharField(max_length=200, blank=True, default='')
    es_producto_comun = models.BooleanField(default=False)
    cantidad = models.DecimalField(max_digits=10, decimal_places=3)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    precio_tipo = models.CharField(max_length=10, choices=PRECIO_TIPO_CHOICES, default='normal')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def save(self, *args, **kwargs):
        if not self.precio_unitario and not self.es_producto_comun:
            self.precio_unitario = self.producto.precio_venta
            self.precio_tipo = 'normal'
        self.subtotal = self.cantidad * self.precio_unitario
        super().save(*args, **kwargs)
        self.venta.calcular_total()

    def __str__(self):
        nombre = self.producto_comun_nombre if self.es_producto_comun else self.producto.nombre
        return f'{self.cantidad}x {nombre} en venta #{self.venta.id}'

    class Meta:
        verbose_name_plural = "Detalles de Venta"


class Ticket(models.Model):
    venta = models.OneToOneField(Venta, on_delete=models.CASCADE, related_name='ticket')
    numero = models.CharField(max_length=30, unique=True)
    generado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Ticket {self.numero}"

    class Meta:
        verbose_name_plural = "Tickets"


class PagoTicket(models.Model):
    METODO_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('mixto', 'Mixto'),
        ('credito', 'Crédito'),
    ]

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='pagos')
    metodo = models.CharField(max_length=20, choices=METODO_CHOICES)

    # Montos por método
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)
    monto_efectivo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monto_tarjeta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monto_recibido = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # lo que dio el cliente en efectivo
    vuelto = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # calculado automáticamente

    # Solo si es crédito
    cliente_credito = models.ForeignKey(
        'clientes.ClienteCredito', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='pagos'
    )

    fecha = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.metodo == 'efectivo':
            self.monto_efectivo = self.monto_total
            self.vuelto = max(self.monto_recibido - self.monto_total, 0)
        elif self.metodo == 'tarjeta':
            self.monto_tarjeta = self.monto_total
            self.vuelto = 0
        elif self.metodo == 'mixto':
            self.monto_efectivo = self.monto_total - self.monto_tarjeta
            self.vuelto = max(self.monto_recibido - self.monto_efectivo, 0)
        else:
            self.vuelto = 0
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_metodo_display()} ${self.monto_total:,.0f} — {self.ticket.numero}"

    class Meta:
        verbose_name_plural = "Pagos de Ticket"

class MovimientoCaja(models.Model):
    TIPO_CHOICES = [
        ('entrada', 'Entrada de Efectivo'),
        ('salida', 'Salida de Efectivo'),
    ]

    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    motivo = models.TextField()
    usuario = models.ForeignKey('usuarios.Usuario', on_delete=models.SET_NULL, null=True)
    fecha = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.get_tipo_display()} ${self.monto:,.0f} — {self.fecha}'

    class Meta:
        verbose_name = 'Movimiento de Caja'
        verbose_name_plural = 'Movimientos de Caja'
        ordering = ['-fecha']


class CorteCaja(models.Model):
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT)
    fecha_inicio = models.DateTimeField(null=True, blank=True)
    fecha_corte = models.DateTimeField(auto_now_add=True)
    total_efectivo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_tarjeta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_credito = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_mixto = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_ventas = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cantidad_tickets = models.IntegerField(default=0)
    total_entradas = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_salidas = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_abonos_credito = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_devoluciones = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notas = models.TextField(blank=True)

    class Meta:
        ordering = ['-fecha_corte']

    def __str__(self):
        return f"Corte #{self.id} — {self.usuario} — {self.fecha_corte}"