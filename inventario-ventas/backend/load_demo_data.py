# backend/load_demo_data.py
"""
Carga datos de demostración en la BD.
Ejecutar: python manage.py shell < load_demo_data.py
"""

from django.contrib.auth.models import User
from clientes.models import Cliente
from productos.models import Producto, Categoria
from ventas.models import Venta

# Crear usuarios demo
User.objects.get_or_create(
    username='admin',
    defaults={
        'email': 'admin@demo.local',
        'first_name': 'Admin',
        'last_name': 'Demo',
        'is_staff': True,
        'is_superuser': True,
        'password': 'pbkdf2_sha256$...'
    }
)

User.objects.get_or_create(
    username='vendedor',
    defaults={
        'email': 'vendedor@demo.local',
        'first_name': 'Vendedor',
        'last_name': 'Demo',
        'is_staff': False,
        'password': 'pbkdf2_sha256$...'
    }
)

# Crear categorías de ejemplo
cat_herramientas = Categoria.objects.create(nombre='Herramientas')
cat_materiales = Categoria.objects.create(nombre='Materiales')

# Crear productos de ejemplo
Producto.objects.create(
    nombre='Martillo 16oz',
    codigo='MAR001',
    categoria=cat_herramientas,
    precio_costo=5000,
    precio_venta=8900,
    stock=50
)

Producto.objects.create(
    nombre='Clavo 2"',
    codigo='CLA001',
    categoria=cat_materiales,
    precio_costo=100,
    precio_venta=200,
    stock=500
)

print("✓ Demo data loaded successfully")