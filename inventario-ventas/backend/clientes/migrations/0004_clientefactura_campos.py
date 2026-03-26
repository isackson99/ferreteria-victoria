from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clientes', '0003_clientecredito_precio_especial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='clientefactura',
            old_name='celular',
            new_name='telefono',
        ),
        migrations.AlterField(
            model_name='clientefactura',
            name='correo',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name='clientefactura',
            name='domicilio',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='clientefactura',
            name='notas',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='clientefactura',
            name='activo',
            field=models.BooleanField(default=True),
        ),
    ]
