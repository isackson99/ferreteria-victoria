from django.core.management.base import BaseCommand
from usuarios.models import Rol, Permiso


class Command(BaseCommand):
    help = 'Crea los roles y permisos iniciales del sistema'

    def handle(self, *args, **kwargs):
        permisos_data = [
            ('puede_vender', 'Puede realizar ventas'),
            ('puede_ver_inventario', 'Puede ver inventario'),
            ('puede_ajustar_inventario', 'Puede ajustar inventario'),
            ('puede_abonar', 'Puede registrar abonos de crédito'),
            ('puede_ver_creditos', 'Puede ver cuentas de crédito'),
            ('puede_ver_costo', 'Puede ver precio de costo'),
            ('puede_crear_productos', 'Puede crear y editar productos'),
            ('puede_crear_usuarios', 'Puede crear y editar usuarios'),
            ('puede_ver_reportes', 'Puede ver reportes y cierre de caja'),
            ('puede_cancelar_ventas', 'Puede cancelar ventas'),
        ]

        permisos = {}
        for codigo, descripcion in permisos_data:
            p, _ = Permiso.objects.get_or_create(codigo=codigo, defaults={'descripcion': descripcion})
            permisos[codigo] = p
            self.stdout.write(f'  Permiso: {codigo}')

        roles_data = {
            'Admin': list(permisos.values()),
            'Vendedor': [
                permisos['puede_vender'],
                permisos['puede_ver_inventario'],
                permisos['puede_abonar'],
                permisos['puede_ver_creditos'],
                permisos['puede_ver_reportes'],
                permisos['puede_cancelar_ventas'],
            ],
            'Bodeguero': [
                permisos['puede_ver_inventario'],
                permisos['puede_ajustar_inventario'],
            ],
        }

        for nombre_rol, perms in roles_data.items():
            rol, _ = Rol.objects.get_or_create(nombre=nombre_rol)
            rol.permisos.set(perms)
            self.stdout.write(self.style.SUCCESS(f'Rol creado: {nombre_rol} con {len(perms)} permisos'))

        self.stdout.write(self.style.SUCCESS('✅ Roles y permisos creados correctamente'))