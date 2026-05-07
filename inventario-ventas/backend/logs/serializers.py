from rest_framework import serializers
from .models import LogEvento


class LogEventoSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.username', read_only=True, default='')

    class Meta:
        model = LogEvento
        fields = [
            'id', 'timestamp', 'usuario', 'usuario_nombre',
            'tipo', 'modulo', 'descripcion', 'detalle', 'ip', 'nivel',
            'ticket_id', 'session_id', 'duracion_ms', 'datos_extra',
        ]
        read_only_fields = ['id', 'timestamp', 'usuario', 'ip', 'usuario_nombre']
