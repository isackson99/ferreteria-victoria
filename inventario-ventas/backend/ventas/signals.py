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
            es_devolucion = item.precio_tipo == 'devolucion'
            cantidad_abs = abs(item.cantidad)
            tipo_mov = 'devolucion' if es_devolucion else 'venta'

            if producto.tipo == 'kit' and not es_devolucion:
                componentes = producto.kit.obtener_componentes_simples(cantidad_abs)
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
                # cantidad negativa (devolucion) suma al inventario; positiva lo resta
                producto.inventario_actual -= item.cantidad
                producto.save()
                motivo = (
                    f'Devolución en ticket #{instance.id}'
                    if es_devolucion
                    else f'Venta #{instance.id}'
                )
                MovimientoInventario.objects.create(
                    producto=producto,
                    tipo=tipo_mov,
                    cantidad=cantidad_abs,
                    stock_antes=stock_antes,
                    stock_despues=producto.inventario_actual,
                    motivo=motivo,
                    usuario=instance.usuario,
                    referencia_venta=instance,
                )
                notificar_stock_actualizado(producto)
                crear_notificacion_stock(producto)

