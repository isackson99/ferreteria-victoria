import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from productos.routing import websocket_urlpatterns as productos_ws
from notificaciones.routing import websocket_urlpatterns as notificaciones_ws

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter(
            productos_ws + notificaciones_ws
        )
    ),
})

try:
    from core.scheduler import iniciar_scheduler
    iniciar_scheduler()
except Exception as e:
    import logging
    logging.getLogger(__name__).error(f'Error al iniciar scheduler: {e}')