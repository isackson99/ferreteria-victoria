from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Notificacion, ConfiguracionNotificacion, TipoNotificacion
from .serializers import NotificacionSerializer, ConfiguracionNotificacionSerializer, TipoNotificacionSerializer


class TipoNotificacionViewSet(viewsets.ModelViewSet):
    queryset = TipoNotificacion.objects.all()
    serializer_class = TipoNotificacionSerializer
    permission_classes = [permissions.IsAdminUser]

    def destroy(self, request, *args, **kwargs):
        tipo = self.get_object()
        if tipo.sistema:
            return Response(
                {'error': 'No puedes eliminar un tipo de notificación del sistema.'},
                status=400
            )
        return super().destroy(request, *args, **kwargs)


class NotificacionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificacionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Notificacion.objects.filter(
            destinatario_rol=user.rol
        ) | Notificacion.objects.filter(
            destinatario_usuario=user
        ).order_by('-creada')

    @action(detail=True, methods=['post'])
    def marcar_leida(self, request, pk=None):
        notificacion = self.get_object()
        notificacion.leida = True
        notificacion.save()
        return Response(NotificacionSerializer(notificacion).data)

    @action(detail=False, methods=['post'])
    def marcar_todas_leidas(self, request):
        self.get_queryset().filter(leida=False).update(leida=True)
        return Response({'mensaje': 'Todas las notificaciones marcadas como leídas.'})

    @action(detail=False, methods=['get'])
    def no_leidas(self, request):
        qs = self.get_queryset().filter(leida=False)
        return Response({
            'cantidad': qs.count(),
            'notificaciones': NotificacionSerializer(qs, many=True).data
        })


class ConfiguracionNotificacionViewSet(viewsets.ModelViewSet):
    queryset = ConfiguracionNotificacion.objects.select_related('rol', 'tipo').all()
    serializer_class = ConfiguracionNotificacionSerializer
    permission_classes = [permissions.IsAdminUser]

    @action(detail=False, methods=['get'])
    def por_rol(self, request):
        from usuarios.models import Rol
        roles = Rol.objects.prefetch_related('configuraciones_notificacion__tipo').all()
        tipos = TipoNotificacion.objects.all()

        resultado = []
        for rol in roles:
            configs_activas = {
                c.tipo_id: c.id
                for c in rol.configuraciones_notificacion.filter(activa=True)
            }
            resultado.append({
                'rol_id': rol.id,
                'rol_nombre': rol.nombre,
                'notificaciones': [
                    {
                        'tipo_id': tipo.id,
                        'tipo_codigo': tipo.codigo,
                        'tipo_nombre': tipo.nombre,
                        'activa': tipo.id in configs_activas,
                        'config_id': configs_activas.get(tipo.id),
                    }
                    for tipo in tipos
                ]
            })
        return Response(resultado)

    @action(detail=False, methods=['post'])
    def toggle(self, request):
        rol_id = request.data.get('rol_id')
        tipo_id = request.data.get('tipo_id')
        activa = request.data.get('activa')

        if not all([rol_id, tipo_id, activa is not None]):
            return Response({'error': 'Debes enviar rol_id, tipo_id y activa.'}, status=400)

        config, creada = ConfiguracionNotificacion.objects.get_or_create(
            rol_id=rol_id,
            tipo_id=tipo_id,
            defaults={'activa': activa}
        )
        if not creada:
            config.activa = activa
            config.save()

        return Response(ConfiguracionNotificacionSerializer(config).data)