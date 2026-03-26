from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Crea los tipos de notificación del sistema'

    def handle(self, *args, **kwargs):
        from notificaciones.models import TipoNotificacion

        tipos_sistema = [
            ('stock_bajo', 'Stock Bajo', 'El inventario de un producto bajó del mínimo'),
            ('stock_agotado', 'Stock Agotado', 'Un producto llegó a cero unidades'),
            ('stock_sobre', 'Sobrestock', 'Un producto superó el inventario máximo'),
            ('producto_estancado', 'Producto Estancado', 'Un producto lleva 30 días sin venderse'),
            ('credito_por_vencer', 'Crédito por Vencer', 'El crédito de un cliente vence en 7 días'),
            ('credito_vencido', 'Crédito Vencido', 'El crédito de un cliente ya venció'),
            ('credito_limite', 'Cliente cerca del Límite', 'Un cliente usó más del 80% de su crédito'),
            ('abono_registrado', 'Abono Registrado', 'Un cliente realizó un abono a su deuda'),
            ('cierre_caja', 'Cierre de Caja', 'Resumen diario de ventas'),
            ('usuario_nuevo', 'Usuario Nuevo', 'Se creó un nuevo usuario en el sistema'),
            ('acceso_denegado', 'Acceso Denegado', 'Un usuario intentó acceder sin permiso'),
            ('venta_credito', 'Venta a Crédito', 'Se registró una venta a crédito'),
            ('venta_completada', 'Venta Completada', 'Se completó una venta'),
            ('venta_cancelada', 'Venta Cancelada', 'Se canceló una venta'),
        ]

        for codigo, nombre, descripcion in tipos_sistema:
            tipo, creado = TipoNotificacion.objects.get_or_create(
                codigo=codigo,
                defaults={
                    'nombre': nombre,
                    'descripcion': descripcion,
                    'sistema': True,
                }
            )
            estado = 'creado' if creado else 'ya existe'
            self.stdout.write(f'  {nombre}: {estado}')

        self.stdout.write(self.style.SUCCESS('✅ Tipos de notificación del sistema creados'))