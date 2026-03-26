import logging
from django.db.models.signals import pre_save
from django.dispatch import receiver
from .models import Venta

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Venta)
def descontar_inventario_al_completar(sender, instance, **kwargs):
    if not instance.pk:
        return

    try:
        venta_anterior = Venta.objects.get(pk=instance.pk)
    except Venta.DoesNotExist:
        return

    if venta_anterior.estado == 'pendiente' and instance.estado == 'completada':
        from productos.signals import notificar_stock_actualizado, crear_notificacion_stock
        from productos.models import MovimientoInventario

        for item in instance.items.select_related('producto'):
            if item.es_producto_comun:
                continue

            producto = item.producto

            if producto.tipo == 'kit':
                componentes = producto.kit.obtener_componentes_simples(item.cantidad)
                for data in componentes.values():
                    p = data['producto']
                    stock_antes = p.inventario_actual
                    p.inventario_actual -= data['cantidad']
                    p.save()
                    MovimientoInventario.objects.create(
                        producto=p,
                        tipo='venta',
                        cantidad=data['cantidad'],
                        stock_antes=stock_antes,
                        stock_despues=p.inventario_actual,
                        motivo=f'Venta #{instance.id} (kit {producto.nombre})',
                        usuario=instance.usuario,
                        referencia_venta=instance,
                    )
                    notificar_stock_actualizado(p)
                    crear_notificacion_stock(p)
            else:
                stock_antes = producto.inventario_actual
                producto.inventario_actual -= item.cantidad
                producto.save()
                MovimientoInventario.objects.create(
                    producto=producto,
                    tipo='venta',
                    cantidad=item.cantidad,
                    stock_antes=stock_antes,
                    stock_despues=producto.inventario_actual,
                    motivo=f'Venta #{instance.id}',
                    usuario=instance.usuario,
                    referencia_venta=instance,
                )
                notificar_stock_actualizado(producto)
                crear_notificacion_stock(producto)

    if venta_anterior.estado == 'pendiente' and instance.estado == 'cancelada':
        from notificaciones.models import Notificacion, TipoNotificacion, ConfiguracionNotificacion

        try:
            tipo = TipoNotificacion.objects.get(codigo='venta_cancelada')
        except TipoNotificacion.DoesNotExist:
            return

        roles_activos = ConfiguracionNotificacion.objects.filter(
            tipo=tipo, activa=True
        ).select_related('rol')

        for config in roles_activos:
            Notificacion.objects.create(
                tipo=tipo,
                titulo=f'Venta cancelada — #{instance.id}',
                mensaje=f'La venta #{instance.id} fue cancelada por {instance.usuario}. Total: ${instance.total:,.0f}.',
                destinatario_rol=config.rol,
                referencia_id=instance.id,
                referencia_tipo='venta',
            )