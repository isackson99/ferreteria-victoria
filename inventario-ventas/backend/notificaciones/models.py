from django.db import models
from usuarios.models import Usuario, Rol


class TipoNotificacion(models.Model):
    codigo = models.CharField(max_length=50, unique=True)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    sistema = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.nombre} ({self.codigo})'

    class Meta:
        verbose_name = 'Tipo de Notificación'
        verbose_name_plural = 'Tipos de Notificación'
        ordering = ['nombre']


class ConfiguracionNotificacion(models.Model):
    rol = models.ForeignKey(Rol, on_delete=models.CASCADE, related_name='configuraciones_notificacion')
    tipo = models.ForeignKey(TipoNotificacion, on_delete=models.CASCADE, related_name='configuraciones')
    activa = models.BooleanField(default=True)

    class Meta:
        unique_together = ['rol', 'tipo']
        verbose_name = 'Configuración de Notificación'
        verbose_name_plural = 'Configuraciones de Notificaciones'

    def __str__(self):
        estado = 'ON' if self.activa else 'OFF'
        return f'{self.rol.nombre} — {self.tipo.nombre} [{estado}]'


class Notificacion(models.Model):
    tipo = models.ForeignKey(TipoNotificacion, on_delete=models.PROTECT, related_name='notificaciones')
    titulo = models.CharField(max_length=200)
    mensaje = models.TextField()
    leida = models.BooleanField(default=False)
    destinatario_rol = models.ForeignKey(Rol, on_delete=models.SET_NULL, null=True, blank=True, related_name='notificaciones')
    destinatario_usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name='notificaciones')
    referencia_id = models.IntegerField(null=True, blank=True)
    referencia_tipo = models.CharField(max_length=50, blank=True)
    creada = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'[{self.tipo.nombre}] {self.titulo}'

    class Meta:
        verbose_name_plural = 'Notificaciones'
        ordering = ['-creada']
        
def emitir_notificacion(notificacion):
    """Emite una notificación por WebSocket al grupo del rol correspondiente."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        import logging

        channel_layer = get_channel_layer()
        logger = logging.getLogger(__name__)

        if notificacion.destinatario_rol:
            group_name = f'notificaciones_rol_{notificacion.destinatario_rol_id}'
        elif notificacion.destinatario_usuario:
            group_name = f'notificaciones_user_{notificacion.destinatario_usuario_id}'
        else:
            return

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'nueva_notificacion',
                'notificacion': {
                    'id': notificacion.id,
                    'titulo': notificacion.titulo,
                    'mensaje': notificacion.mensaje,
                    'tipo_codigo': notificacion.tipo.codigo,
                    'tipo_nombre': notificacion.tipo.nombre,
                    'creada': notificacion.creada.isoformat(),
                }
            }
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f'WebSocket notificación no enviada: {e}')