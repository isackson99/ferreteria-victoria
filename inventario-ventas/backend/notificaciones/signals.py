from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Notificacion


@receiver(post_save, sender=Notificacion)
def emitir_al_crear(sender, instance, created, **kwargs):
    if created:
        from .models import emitir_notificacion
        emitir_notificacion(instance)