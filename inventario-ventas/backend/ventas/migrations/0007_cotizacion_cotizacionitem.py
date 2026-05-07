# Generated manually 2026-03-28

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ventas', '0006_alter_detalleventa_precio_tipo_alter_venta_estado'),
        ('productos', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Cotizacion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('numero', models.CharField(max_length=30, unique=True)),
                ('estado', models.CharField(choices=[('activa', 'Activa'), ('usada', 'Usada'), ('eliminada', 'Eliminada')], default='activa', max_length=20)),
                ('notas', models.TextField(blank=True)),
                ('creada', models.DateTimeField(auto_now_add=True)),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cotizaciones', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'Cotizaciones',
                'ordering': ['-creada'],
            },
        ),
        migrations.CreateModel(
            name='CotizacionItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('es_producto_comun', models.BooleanField(default=False)),
                ('producto_comun_nombre', models.CharField(blank=True, max_length=200)),
                ('cantidad', models.DecimalField(decimal_places=3, max_digits=10)),
                ('precio_unitario', models.DecimalField(decimal_places=2, max_digits=12)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('cotizacion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='ventas.cotizacion')),
                ('producto', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='productos.producto')),
            ],
            options={
                'verbose_name_plural': 'Items de Cotización',
            },
        ),
    ]
