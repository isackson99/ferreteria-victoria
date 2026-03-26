from django.contrib import admin
from .models import ClienteCredito, ClienteFactura


@admin.register(ClienteCredito)
class ClienteCreditoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'credito_ilimitado', 'credito_maximo', 'fecha_vencimiento', 'activo']
    list_filter = ['credito_ilimitado', 'activo']
    search_fields = ['nombre']


@admin.register(ClienteFactura)
class ClienteFacturaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'rut', 'correo', 'telefono', 'activo']
    search_fields = ['nombre', 'rut']