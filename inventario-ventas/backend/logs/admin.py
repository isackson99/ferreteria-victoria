from django.contrib import admin
from .models import LogEvento


@admin.register(LogEvento)
class LogEventoAdmin(admin.ModelAdmin):
    list_display  = ('timestamp', 'nivel', 'tipo', 'modulo', 'descripcion', 'usuario', 'ip')
    list_filter   = ('nivel', 'tipo', 'modulo')
    search_fields = ('descripcion', 'detalle', 'usuario__username')
    readonly_fields = ('timestamp', 'usuario', 'ip')
    ordering      = ('-timestamp',)
