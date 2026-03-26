from django.db import models
from usuarios.models import Usuario
from clientes.models import ClienteCredito
from ventas.models import Ticket


class CuentaCredito(models.Model):
    cliente = models.OneToOneField(ClienteCredito, on_delete=models.CASCADE, related_name='cuenta')
    saldo_usado = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    @property
    def saldo_disponible(self):
        if self.cliente.credito_ilimitado:
            return None
        return self.cliente.credito_maximo - self.saldo_usado

    @property
    def porcentaje_uso(self):
        if self.cliente.credito_ilimitado or self.cliente.credito_maximo == 0:
            return 0
        return (self.saldo_usado / self.cliente.credito_maximo) * 100

    def puede_comprar(self, monto):
        if self.cliente.credito_ilimitado:
            return True
        return self.saldo_disponible >= monto

    def __str__(self):
        return f"Cuenta de {self.cliente.nombre} — Usado: ${self.saldo_usado:,.0f}"

    class Meta:
        verbose_name = "Cuenta Crédito"
        verbose_name_plural = "Cuentas Crédito"


class MovimientoCredito(models.Model):
    TIPO_CHOICES = [
        ('cargo', 'Cargo'),
        ('abono', 'Abono'),
    ]

    METODO_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
    ]

    cuenta = models.ForeignKey(CuentaCredito, on_delete=models.CASCADE, related_name='movimientos')
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    ticket = models.ForeignKey(Ticket, on_delete=models.SET_NULL, null=True, blank=True, related_name='movimientos_credito')
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name='movimientos_credito')
    metodo_pago = models.CharField(max_length=20, choices=METODO_CHOICES, blank=True)
    notas = models.TextField(blank=True)
    fecha = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_tipo_display()} ${self.monto:,.0f} — {self.cuenta.cliente.nombre}"

    class Meta:
        verbose_name = "Movimiento de Crédito"
        verbose_name_plural = "Movimientos de Crédito"
        ordering = ['-fecha']