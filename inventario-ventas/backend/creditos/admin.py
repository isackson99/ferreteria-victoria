from django.contrib import admin
from .models import CuentaCredito, MovimientoCredito


class MovimientoCreditoInline(admin.TabularInline):
    model = MovimientoCredito
    extra = 0
    readonly_fields = ['fecha']


@admin.register(CuentaCredito)
class CuentaCreditoAdmin(admin.ModelAdmin):
    list_display = ['cliente', 'saldo_usado']
    inlines = [MovimientoCreditoInline]


@admin.register(MovimientoCredito)
class MovimientoCreditoAdmin(admin.ModelAdmin):
    list_display = ['cuenta', 'tipo', 'monto', 'metodo_pago', 'usuario', 'fecha']
    list_filter = ['tipo', 'metodo_pago']