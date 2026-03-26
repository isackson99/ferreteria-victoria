from rest_framework import serializers
from .models import Notificacion, ConfiguracionNotificacion, TipoNotificacion


class TipoNotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoNotificacion
        fields = ['id', 'codigo', 'nombre', 'descripcion', 'sistema']
        read_only_fields = ['sistema']


class ConfiguracionNotificacionSerializer(serializers.ModelSerializer):
    rol_nombre = serializers.CharField(source='rol.nombre', read_only=True)
    tipo_nombre = serializers.CharField(source='tipo.nombre', read_only=True)
    tipo_codigo = serializers.CharField(source='tipo.codigo', read_only=True)

    class Meta:
        model = ConfiguracionNotificacion
        fields = ['id', 'rol', 'rol_nombre', 'tipo', 'tipo_nombre', 'tipo_codigo', 'activa']


class NotificacionSerializer(serializers.ModelSerializer):
    tipo_nombre = serializers.CharField(source='tipo.nombre', read_only=True)
    tipo_codigo = serializers.CharField(source='tipo.codigo', read_only=True)
    destinatario_rol_nombre = serializers.CharField(source='destinatario_rol.nombre', read_only=True)

    class Meta:
        model = Notificacion
        fields = [
            'id', 'tipo', 'tipo_nombre', 'tipo_codigo', 'titulo', 'mensaje', 'leida',
            'destinatario_rol', 'destinatario_rol_nombre',
            'destinatario_usuario', 'referencia_id', 'referencia_tipo', 'creada'
        ]