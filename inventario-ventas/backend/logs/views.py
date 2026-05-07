from django.db.models import Q, Count, Max
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from usuarios.permissions import EsAdmin
from .models import LogEvento
from .serializers import LogEventoSerializer


# ─── Paginación ───────────────────────────────────────────────────────────────

class LogPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 500


# ─── Utilidad importable desde cualquier view ─────────────────────────────────

def _get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')


def log_evento(request, tipo, modulo, descripcion, detalle=None, nivel='INFO',
               ticket_id=None, session_id=None, duracion_ms=None, datos_extra=None):
    """Registra un LogEvento. Nunca lanza excepciones para no interrumpir la vista llamante."""
    try:
        usuario = (
            request.user
            if request and hasattr(request, 'user') and request.user.is_authenticated
            else None
        )
        ip = _get_client_ip(request) if request else None
        # Extraer session_id del header X-Session-ID si no se pasó explícitamente
        if session_id is None and request:
            session_id = request.META.get('HTTP_X_SESSION_ID') or None
        LogEvento.objects.create(
            usuario=usuario,
            tipo=tipo,
            modulo=modulo,
            descripcion=descripcion[:500],
            detalle=detalle,
            ip=ip,
            nivel=nivel,
            ticket_id=ticket_id,
            session_id=session_id,
            duracion_ms=duracion_ms,
            datos_extra=datos_extra,
        )
    except Exception:
        pass


# ─── ViewSet ──────────────────────────────────────────────────────────────────

class LogEventoViewSet(viewsets.ModelViewSet):
    serializer_class = LogEventoSerializer
    pagination_class = LogPagination
    http_method_names = ['get', 'post', 'head', 'options']  # no PUT/PATCH/DELETE

    def get_queryset(self):
        qs = LogEvento.objects.select_related('usuario').all()
        p = self.request.query_params

        tipo        = p.get('tipo')
        nivel       = p.get('nivel')
        modulo      = p.get('modulo')
        usuario_id  = p.get('usuario')
        f_inicio    = p.get('fecha_inicio')
        f_fin       = p.get('fecha_fin')
        search      = p.get('search', '').strip()
        ticket_id   = p.get('ticket_id')
        session_id  = p.get('session_id')
        duracion_min = p.get('duracion_min')

        if tipo:
            qs = qs.filter(tipo=tipo)
        if nivel:
            qs = qs.filter(nivel=nivel)
        if modulo:
            qs = qs.filter(modulo__icontains=modulo)
        if usuario_id:
            qs = qs.filter(usuario_id=usuario_id)
        if f_inicio:
            qs = qs.filter(timestamp__date__gte=f_inicio)
        if f_fin:
            qs = qs.filter(timestamp__date__lte=f_fin)
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)
        if session_id:
            qs = qs.filter(session_id=session_id)
        if duracion_min:
            try:
                qs = qs.filter(duracion_ms__gte=int(duracion_min))
            except ValueError:
                pass
        if search:
            qs = qs.filter(
                Q(descripcion__icontains=search) |
                Q(detalle__icontains=search) |
                Q(modulo__icontains=search)
            )
        return qs

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.IsAuthenticated()]
        return [EsAdmin()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        usuario = request.user if request.user.is_authenticated else None
        # Extraer session_id del header si no viene en el body
        session_id = request.data.get('session_id') or request.META.get('HTTP_X_SESSION_ID') or None
        serializer.save(
            usuario=usuario,
            ip=_get_client_ip(request),
            session_id=session_id,
        )
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['get'])
    def resumen(self, request):
        """Estadísticas rápidas para el dashboard de logs."""
        ahora = timezone.now()
        hace_24h = ahora - timedelta(hours=24)
        hoy = ahora.date()

        errores_24h = LogEvento.objects.filter(
            nivel='ERROR', timestamp__gte=hace_24h
        ).count()

        usuario_row = (
            LogEvento.objects
            .filter(timestamp__date=hoy, usuario__isnull=False)
            .values('usuario__username')
            .annotate(total=Count('id'))
            .order_by('-total')
            .first()
        )
        usuario_activo = usuario_row['usuario__username'] if usuario_row else None

        op_lenta = (
            LogEvento.objects
            .filter(timestamp__date=hoy, duracion_ms__isnull=False)
            .order_by('-duracion_ms')
            .values('descripcion', 'duracion_ms', 'modulo')
            .first()
        )

        ventas_hoy = LogEvento.objects.filter(
            timestamp__date=hoy,
            tipo='VENTA',
            descripcion__icontains='cobrada',
        ).count()

        return Response({
            'errores_24h':       errores_24h,
            'usuario_activo_hoy': usuario_activo,
            'operacion_lenta_hoy': op_lenta,
            'ventas_hoy':        ventas_hoy,
        })
