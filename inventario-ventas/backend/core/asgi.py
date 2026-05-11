import os
import django

# 1. Configurar el entorno de Django primero
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

# 2. Imports después de django.setup()
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from productos.routing import websocket_urlpatterns as productos_ws
from notificaciones.routing import websocket_urlpatterns as notificaciones_ws

# 3. Definir la aplicación ASGI
application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter(
            productos_ws + notificaciones_ws
        )
    ),
})

# 4. Iniciar el Scheduler solo si no estamos en un comando de management (opcional pero recomendado)
try:
    from core.scheduler import iniciar_scheduler
    # Esto evita que se ejecute si estás haciendo migraciones o collectstatic
    import sys
    if 'manage.py' not in sys.argv:
        iniciar_scheduler()
except Exception as e:
    import logging
    logging.getLogger(__name__).error(f'Error al iniciar scheduler: {e}')
