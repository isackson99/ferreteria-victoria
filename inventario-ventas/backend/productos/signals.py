import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def notificar_stock_actualizado(producto):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'inventario',
            {
                'type': 'stock_actualizado',
                'producto': {
                    'id': producto.id,
                    'nombre': producto.nombre,
                    'codigo': producto.codigo,
                    'precio': float(producto.precio_venta),
                    'inventario_actual': float(producto.inventario_actual),
                    'disponible': producto.disponible,
                    'stock_bajo': producto.stock_bajo,
                    'stock_sobre': producto.stock_sobre,
                }
            }
        )
    except Exception as e:
        logger.warning(f'WebSocket no disponible, continuando sin notificar: {e}')


def notificar_venta_completada(ticket, usuario):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'inventario',
            {
                'type': 'venta_completada',
                'ticket': ticket.numero,
                'usuario': usuario.username,
            }
        )
    except Exception as e:
        logger.warning(f'WebSocket no disponible, continuando sin notificar: {e}')


def notificar_servidor_cerrado():
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'inventario',
            {
                'type': 'servidor_cerrado',
                'mensaje': 'El servidor ha sido cerrado por el administrador.',
            }
        )
    except Exception as e:
        logger.warning(f'WebSocket no disponible: {e}')


def rol_recibe_notificacion(rol, tipo):
    from notificaciones.models import ConfiguracionNotificacion
    return ConfiguracionNotificacion.objects.filter(
        rol=rol, tipo=tipo, activa=True
    ).exists()


def crear_notificacion_stock(producto):
    from notificaciones.models import Notificacion, TipoNotificacion, ConfiguracionNotificacion
    from usuarios.models import Rol
    from django.utils import timezone

    if producto.inventario_actual <= 0:
        codigo_tipo = 'stock_agotado'
        titulo = f'Stock agotado — {producto.nombre}'
        mensaje = f'{producto.nombre} se ha agotado completamente.'
    elif producto.stock_bajo:
        codigo_tipo = 'stock_bajo'
        titulo = f'Stock bajo — {producto.nombre}'
        mensaje = f'{producto.nombre} tiene stock bajo. Actual: {producto.inventario_actual}, Mínimo: {producto.inventario_minimo}.'
    elif producto.stock_sobre:
        codigo_tipo = 'stock_sobre'
        titulo = f'Sobrestock — {producto.nombre}'
        mensaje = f'{producto.nombre} superó el stock máximo. Actual: {producto.inventario_actual}, Máximo: {producto.inventario_maximo}.'
    else:
        return

    try:
        tipo = TipoNotificacion.objects.get(codigo=codigo_tipo)
    except TipoNotificacion.DoesNotExist:
        logger.warning(f'Tipo de notificación {codigo_tipo} no existe')
        return

    roles_activos = ConfiguracionNotificacion.objects.filter(
        tipo=tipo, activa=True
    ).select_related('rol')

    hoy = timezone.now().date()

    for config in roles_activos:
        ya_notificado = Notificacion.objects.filter(
            tipo=tipo,
            referencia_id=producto.id,
            referencia_tipo='producto',
            creada__date=hoy,
            destinatario_rol=config.rol,
        ).exists()

        if not ya_notificado:
            Notificacion.objects.create(
                tipo=tipo,
                titulo=titulo,
                mensaje=mensaje,
                destinatario_rol=config.rol,
                referencia_id=producto.id,
                referencia_tipo='producto',
            )