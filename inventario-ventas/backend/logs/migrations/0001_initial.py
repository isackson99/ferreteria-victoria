from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LogEvento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('tipo', models.CharField(
                    choices=[
                        ('ERROR', 'Error'),
                        ('CAMBIO_TICKET', 'Cambio de Ticket'),
                        ('VENTA', 'Venta'),
                        ('ACCESO', 'Acceso'),
                        ('ADVERTENCIA', 'Advertencia'),
                    ],
                    db_index=True, max_length=20,
                )),
                ('modulo', models.CharField(db_index=True, max_length=100)),
                ('descripcion', models.CharField(max_length=500)),
                ('detalle', models.TextField(blank=True, null=True)),
                ('ip', models.CharField(blank=True, max_length=45, null=True)),
                ('nivel', models.CharField(
                    choices=[('INFO', 'Info'), ('WARNING', 'Warning'), ('ERROR', 'Error')],
                    db_index=True, default='INFO', max_length=10,
                )),
                ('usuario', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Log de Evento',
                'verbose_name_plural': 'Logs de Eventos',
                'ordering': ['-timestamp'],
            },
        ),
    ]
