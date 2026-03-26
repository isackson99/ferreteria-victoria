import logging
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


def verificar_creditos_por_vencer():
    from clientes.models import ClienteCredito
    from notificaciones.models import Notificacion
    from usuarios.models import Rol

    hoy = timezone.now().date()
    en_7_dias = hoy + timedelta(days=7)

    clientes = ClienteCredito.objects.filter(
        activo=True,
        fecha_vencimiento__isnull=False,
        fecha_vencimiento__gte=hoy,
        fecha_vencimiento__lte=en_7_dias,
    )

    for cliente in clientes:
        dias_restantes = (cliente.fecha_vencimiento - hoy).days
        ya_notificado = Notificacion.objects.filter(
            tipo='credito_por_vencer',
            referencia_id=cliente.id,
            referencia_tipo='cliente_credito',
            creada__date=hoy,
        ).exists()

        if not ya_notificado:
            try:
                rol_admin = Rol.objects.get(nombre='Admin')
                rol_vendedor = Rol.objects.get(nombre='Vendedor')
            except Rol.DoesNotExist:
                continue

            mensaje = f'El crédito de {cliente.nombre} vence en {dias_restantes} día(s) ({cliente.fecha_vencimiento}).'

            for rol in [rol_admin, rol_vendedor]:
                Notificacion.objects.create(
                    tipo='credito_por_vencer',
                    titulo=f'Crédito por vencer — {cliente.nombre}',
                    mensaje=mensaje,
                    destinatario_rol=rol,
                    referencia_id=cliente.id,
                    referencia_tipo='cliente_credito',
                )

    logger.info(f'✅ verificar_creditos_por_vencer: {clientes.count()} cliente(s) revisado(s)')


def verificar_creditos_vencidos():
    from clientes.models import ClienteCredito
    from notificaciones.models import Notificacion
    from usuarios.models import Rol

    hoy = timezone.now().date()

    clientes = ClienteCredito.objects.filter(
        activo=True,
        fecha_vencimiento__isnull=False,
        fecha_vencimiento__lt=hoy,
    )

    for cliente in clientes:
        ya_notificado = Notificacion.objects.filter(
            tipo='credito_vencido',
            referencia_id=cliente.id,
            referencia_tipo='cliente_credito',
            creada__date=hoy,
        ).exists()

        if not ya_notificado:
            try:
                rol_admin = Rol.objects.get(nombre='Admin')
                rol_vendedor = Rol.objects.get(nombre='Vendedor')
            except Rol.DoesNotExist:
                continue

            mensaje = f'El crédito de {cliente.nombre} venció el {cliente.fecha_vencimiento} y aún tiene deuda pendiente.'

            for rol in [rol_admin, rol_vendedor]:
                Notificacion.objects.create(
                    tipo='credito_vencido',
                    titulo=f'Crédito vencido — {cliente.nombre}',
                    mensaje=mensaje,
                    destinatario_rol=rol,
                    referencia_id=cliente.id,
                    referencia_tipo='cliente_credito',
                )

    logger.info(f'✅ verificar_creditos_vencidos: {clientes.count()} cliente(s) revisado(s)')


def verificar_productos_estancados():
    from productos.models import Producto
    from ventas.models import DetalleVenta
    from notificaciones.models import Notificacion
    from usuarios.models import Rol

    hoy = timezone.now().date()
    hace_30_dias = hoy - timedelta(days=30)

    productos = Producto.objects.filter(activo=True)

    for producto in productos:
        vendido_recientemente = DetalleVenta.objects.filter(
            producto=producto,
            venta__estado='completada',
            venta__creada__date__gte=hace_30_dias,
        ).exists()

        if not vendido_recientemente:
            ya_notificado = Notificacion.objects.filter(
                tipo='producto_estancado',
                referencia_id=producto.id,
                referencia_tipo='producto',
                creada__date__gte=hoy - timedelta(days=7),
            ).exists()

            if not ya_notificado:
                try:
                    rol_admin = Rol.objects.get(nombre='Admin')
                    rol_bodeguero = Rol.objects.get(nombre='Bodeguero')
                except Rol.DoesNotExist:
                    continue

                mensaje = f'{producto.nombre} no ha registrado ventas en los últimos 30 días. Stock actual: {producto.inventario_actual}.'

                for rol in [rol_admin, rol_bodeguero]:
                    Notificacion.objects.create(
                        tipo='producto_estancado',
                        titulo=f'Producto estancado — {producto.nombre}',
                        mensaje=mensaje,
                        destinatario_rol=rol,
                        referencia_id=producto.id,
                        referencia_tipo='producto',
                    )

    logger.info('✅ verificar_productos_estancados ejecutado')


def generar_cierre_de_caja():
    from ventas.models import Venta, PagoTicket
    from notificaciones.models import Notificacion
    from usuarios.models import Rol
    from django.db.models import Sum

    hoy = timezone.now().date()

    ventas_hoy = Venta.objects.filter(
        estado='completada',
        completada__date=hoy,
    )

    total_ventas = ventas_hoy.aggregate(total=Sum('total'))['total'] or 0
    cantidad_ventas = ventas_hoy.count()

    pagos = PagoTicket.objects.filter(ticket__venta__in=ventas_hoy)
    total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_efectivo'))['t'] or 0
    total_tarjeta = pagos.filter(metodo__in=['tarjeta', 'mixto']).aggregate(t=Sum('monto_tarjeta'))['t'] or 0
    total_credito = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0

    ya_generado = Notificacion.objects.filter(
        tipo='cierre_caja',
        creada__date=hoy,
    ).exists()

    if not ya_generado:
        try:
            rol_admin = Rol.objects.get(nombre='Admin')
            rol_vendedor = Rol.objects.get(nombre='Vendedor')
        except Rol.DoesNotExist:
            return

        mensaje = (
            f'Resumen del {hoy}:\n'
            f'Total ventas: {cantidad_ventas}\n'
            f'Monto total: ${total_ventas:,.0f}\n'
            f'Efectivo: ${total_efectivo:,.0f}\n'
            f'Tarjeta: ${total_tarjeta:,.0f}\n'
            f'Crédito: ${total_credito:,.0f}'
        )

        for rol in [rol_admin, rol_vendedor]:
            Notificacion.objects.create(
                tipo='cierre_caja',
                titulo=f'Cierre de caja — {hoy}',
                mensaje=mensaje,
                destinatario_rol=rol,
            )

    logger.info(f'✅ Cierre de caja generado: ${total_ventas:,.0f} en {cantidad_ventas} venta(s)')