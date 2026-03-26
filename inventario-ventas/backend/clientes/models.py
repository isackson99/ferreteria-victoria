from django.db import models
from django.core.exceptions import ValidationError


class ClienteCredito(models.Model):
    nombre = models.CharField(max_length=200)
    direccion = models.CharField(max_length=300, blank=True)
    telefono = models.CharField(max_length=100, blank=True)
    credito_ilimitado = models.BooleanField(default=False)
    credito_maximo = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fecha_vencimiento = models.DateField(null=True, blank=True)
    notas = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    precio_especial = models.BooleanField(default=False, verbose_name='Precio especial (costo sin IVA)')
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    def clean(self):
        if not self.credito_ilimitado and self.credito_maximo is None:
            raise ValidationError({'credito_maximo': 'Debes definir un monto máximo o marcar como ilimitado.'})
        if self.credito_ilimitado:
            self.credito_maximo = None

    def __str__(self):
        limite = "Ilimitado" if self.credito_ilimitado else f"${self.credito_maximo:,.0f}"
        return f"{self.nombre} (Crédito: {limite})"

    class Meta:
        verbose_name = "Cliente Crédito"
        verbose_name_plural = "Clientes Crédito"


class ClienteFactura(models.Model):
    rut = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=200)
    correo = models.EmailField(blank=True, null=True)
    telefono = models.CharField(max_length=20, blank=True)
    giro = models.CharField(max_length=200, blank=True)
    ciudad = models.CharField(max_length=100, blank=True)
    domicilio = models.CharField(max_length=300, blank=True)
    notas = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.nombre} ({self.rut})"

    class Meta:
        verbose_name = "Cliente Factura"
        verbose_name_plural = "Clientes Factura"