from django.db import migrations

NUEVOS_PERMISOS = [
    ('puede_crear_cliente_credito',  'Puede crear y editar clientes de crédito'),
    ('puede_crear_cliente_factura',  'Puede crear y editar clientes de factura'),
    ('puede_crear_usuario_plataforma', 'Puede crear y editar usuarios de la plataforma'),
]

# Roles que reciben cada permiso nuevo
ASIGNACIONES = {
    'puede_crear_cliente_credito':    ['Admin'],
    'puede_crear_cliente_factura':    ['Admin', 'Cajero', 'Vendedor'],
    'puede_crear_usuario_plataforma': ['Admin'],
}


def agregar_permisos(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    Rol     = apps.get_model('usuarios', 'Rol')

    creados = {}
    for codigo, descripcion in NUEVOS_PERMISOS:
        p, _ = Permiso.objects.get_or_create(
            codigo=codigo, defaults={'descripcion': descripcion}
        )
        creados[codigo] = p

    for codigo, nombres_roles in ASIGNACIONES.items():
        for nombre in nombres_roles:
            try:
                rol = Rol.objects.get(nombre=nombre)
                rol.permisos.add(creados[codigo])
            except Rol.DoesNotExist:
                pass


def revertir(apps, schema_editor):
    Permiso = apps.get_model('usuarios', 'Permiso')
    for codigo, _ in NUEVOS_PERMISOS:
        Permiso.objects.filter(codigo=codigo).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0002_seed_permisos_roles'),
    ]

    operations = [
        migrations.RunPython(agregar_permisos, revertir),
    ]
