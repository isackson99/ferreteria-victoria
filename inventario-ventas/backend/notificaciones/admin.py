from django.contrib import admin
from .models import Notificacion, ConfiguracionNotificacion


@admin.register(ConfiguracionNotificacion)
class ConfiguracionNotificacionAdmin(admin.ModelAdmin):
    list_display = ['rol', 'tipo', 'activa']
    list_filter = ['rol', 'activa']
    list_editable = ['activa']


@admin.register(Notificacion)
class NotificacionAdmin(admin.ModelAdmin):
    list_display = ['titulo', 'tipo', 'leida', 'destinatario_rol', 'destinatario_usuario', 'creada']
    list_filter = ['tipo', 'leida', 'destinatario_rol']
    search_fields = ['titulo', 'mensaje']