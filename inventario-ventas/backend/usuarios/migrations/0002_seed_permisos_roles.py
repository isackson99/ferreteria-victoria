from django.db import migrations


PERMISOS = [
    ('puede_vender',            'Puede realizar ventas'),
    ('puede_cancelar_ventas',   'Puede cancelar ventas'),
    ('puede_ver_inventario',    'Puede ver el inventario'),
    ('puede_ajustar_inventario','Puede ajustar el inventario'),
    ('puede_crear_productos',   'Puede crear y editar productos'),
    ('puede_ver_creditos',      'Puede ver créditos de clientes'),
    ('puede_abonar',            'Puede registrar abonos a créditos'),
    ('puede_crear_usuarios',    'Puede crear y editar usuarios'),
    ('puede_ver_reportes',      'Puede ver reportes'),
    ('puede_hacer_corte',       'Puede realizar corte de caja'),
]

ROLES = {
    'Admin': [
        'puede_vender', 'puede_cancelar_ventas', 'puede_ver_inventario',
        'puede_ajustar_inventario', 'puede_crear_productos', 'puede_ver_creditos',
        'puede_abonar', 'puede_crear_usuarios', 'puede_ver_reportes', 'puede_hacer_corte',
    ],
    'Vendedor': [
        'puede_vender', 'puede_ver_inventario', 'puede_ver_creditos', 'puede_ver_reportes',
    ],
    'Cajero': [
        'puede_vender', 'puede_ver_inventario', 'puede_ver_creditos',
        'puede_abonar', 'puede_hacer_corte',
    ],
    'Bodeguero': [
        'puede_ver_inventario', 'puede_ajustar_inventario', 'puede_crear_productos',
    ],
}


def crear_permisos_y_roles(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol = apps.get_model('usuarios', 'Rol')

    permisos_obj = {}
    for codigo, descripcion in PERMISOS:
        p, _ = Permiso.objects.get_or_create(codigo=codigo, defaults={'descripcion': descripcion})
        permisos_obj[codigo] = p

    for nombre_rol, codigos in ROLES.items():
        rol, _ = Rol.objects.get_or_create(nombre=nombre_rol)
        for codigo in codigos:
            rol.permisos.add(permisos_obj[codigo])


def revertir(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(crear_permisos_y_roles, revertir),
    ]
