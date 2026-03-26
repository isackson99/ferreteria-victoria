from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clientes', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientecredito',
            name='direccion',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='clientecredito',
            name='telefono',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
