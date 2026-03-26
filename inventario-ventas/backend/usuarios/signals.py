from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Usuario


@receiver(post_save, sender=Usuario)
def notificar_usuario_nuevo(sender, instance, created, **kwargs):
    if not created:
        return

    from notificaciones.models import Notificacion, TipoNotificacion, ConfiguracionNotificacion

    try:
        tipo = TipoNotificacion.objects.get(codigo='usuario_nuevo')
    except TipoNotificacion.DoesNotExist:
        return

    roles_activos = ConfiguracionNotificacion.objects.filter(
        tipo=tipo, activa=True
    ).select_related('rol')

    for config in roles_activos:
        Notificacion.objects.create(
            tipo=tipo,
            titulo=f'Nuevo usuario — {instance.username}',
            mensaje=f'Se creó el usuario {instance.username} con rol {instance.rol or "sin rol"}.',
            destinatario_rol=config.rol,
            referencia_id=instance.id,
            referencia_tipo='usuario',
        )