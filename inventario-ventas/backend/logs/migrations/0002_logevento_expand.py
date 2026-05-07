from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('logs', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='logevento',
            name='ticket_id',
            field=models.IntegerField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='logevento',
            name='session_id',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name='logevento',
            name='duracion_ms',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='logevento',
            name='datos_extra',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='logevento',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('ERROR', 'Error'),
                    ('CAMBIO_TICKET', 'Cambio de Ticket'),
                    ('VENTA', 'Venta'),
                    ('ACCESO', 'Acceso'),
                    ('ADVERTENCIA', 'Advertencia'),
                    ('PRODUCTO', 'Producto'),
                    ('CLIENTE', 'Cliente'),
                    ('CREDITO', 'Crédito'),
                    ('CAJA', 'Caja'),
                    ('CONFIGURACION', 'Configuración'),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
