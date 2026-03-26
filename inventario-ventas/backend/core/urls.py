from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from usuarios.views import AuthViewSet, UsuarioViewSet, RolViewSet, PermisoViewSet
from productos.views import ProductoViewSet, CategoriaViewSet
from clientes.views import ClienteCreditoViewSet, ClienteFacturaViewSet
from ventas.views import VentaViewSet, MovimientoCajaViewSet
from creditos.views import CuentaCreditoViewSet, MovimientoCreditoViewSet
from notificaciones.views import NotificacionViewSet, ConfiguracionNotificacionViewSet, TipoNotificacionViewSet
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class ThrottledTokenView(TokenObtainPairView):
    """Login JWT con rate limit: máximo 10 intentos por minuto por IP."""
    throttle_classes = [LoginRateThrottle]

router = DefaultRouter()
router.register(r'auth', AuthViewSet, basename='auth')
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'permisos', PermisoViewSet, basename='permiso')
router.register(r'roles', RolViewSet, basename='rol')
router.register(r'productos', ProductoViewSet, basename='producto')
router.register(r'categorias', CategoriaViewSet, basename='categoria')
router.register(r'clientes-credito', ClienteCreditoViewSet, basename='cliente-credito')
router.register(r'clientes-factura', ClienteFacturaViewSet, basename='cliente-factura')
router.register(r'ventas', VentaViewSet, basename='venta')
router.register(r'cuentas-credito', CuentaCreditoViewSet, basename='cuenta-credito')
router.register(r'movimientos-credito', MovimientoCreditoViewSet, basename='movimiento-credito')
router.register(r'notificaciones', NotificacionViewSet, basename='notificacion')
router.register(r'configuraciones-notificaciones', ConfiguracionNotificacionViewSet, basename='configuracion-notificacion')
router.register(r'tipos-notificacion', TipoNotificacionViewSet, basename='tipo-notificacion')
router.register(r'movimientos-caja', MovimientoCajaViewSet, basename='movimiento-caja')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/reportes/', include('reportes.urls')),
    path('api/corte/', include('ventas.urls_corte')),
    path('api-auth/', include('rest_framework.urls')),
    path('api/token/', ThrottledTokenView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]