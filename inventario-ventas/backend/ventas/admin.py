from django.contrib import admin
from .models import Venta, DetalleVenta, Ticket, PagoTicket


class DetalleVentaInline(admin.TabularInline):
    model = DetalleVenta
    extra = 0
    readonly_fields = ['precio_unitario', 'precio_tipo', 'subtotal']


class PagoTicketInline(admin.TabularInline):
    model = PagoTicket
    extra = 0
    readonly_fields = ['vuelto', 'fecha']


@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ['id', 'usuario', 'estado', 'es_credito', 'total', 'creada']
    list_filter = ['estado', 'es_credito']
    readonly_fields = ['total']
    inlines = [DetalleVentaInline]


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ['numero', 'venta', 'generado']
    inlines = [PagoTicketInline]