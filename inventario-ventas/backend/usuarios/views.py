from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import authenticate, login, logout
from .models import Usuario, Rol, Permiso
from .serializers import UsuarioSerializer, RolSerializer, PermisoSerializer, LoginSerializer
from .permissions import EsAdmin, PuedeCrearUsuarios


class AuthViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]

    @action(detail=False, methods=['post'])
    def login(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password']
        )
        if not user:
            return Response({'error': 'Credenciales incorrectas.'}, status=400)
        if not user.is_active:
            return Response({'error': 'Usuario inactivo.'}, status=403)
        login(request, user)
        return Response(UsuarioSerializer(user).data)

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def logout(self, request):
        logout(request)
        return Response({'mensaje': 'Sesión cerrada.'})

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        return Response(UsuarioSerializer(request.user).data)


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all().select_related('rol')
    serializer_class = UsuarioSerializer

    def get_permissions(self):
        if self.action in ['create', 'destroy', 'update', 'partial_update']:
            return [PuedeCrearUsuarios()]
        return [EsAdmin()]


class PermisoViewSet(viewsets.ModelViewSet):
    queryset = Permiso.objects.all()
    serializer_class = PermisoSerializer
    permission_classes = [EsAdmin]


class RolViewSet(viewsets.ModelViewSet):
    queryset = Rol.objects.prefetch_related('permisos').all()
    serializer_class = RolSerializer
    permission_classes = [EsAdmin]

    @action(detail=True, methods=['post'])
    def asignar_permisos(self, request, pk=None):
        rol = self.get_object()
        permiso_ids = request.data.get('permisos', [])
        if not isinstance(permiso_ids, list):
            return Response({'error': 'Debes enviar una lista de IDs de permisos.'}, status=400)
        permisos = Permiso.objects.filter(id__in=permiso_ids)
        rol.permisos.set(permisos)
        return Response(RolSerializer(rol).data)

    @action(detail=True, methods=['post'])
    def agregar_permiso(self, request, pk=None):
        rol = self.get_object()
        permiso_id = request.data.get('permiso_id')
        try:
            permiso = Permiso.objects.get(id=permiso_id)
            rol.permisos.add(permiso)
            return Response(RolSerializer(rol).data)
        except Permiso.DoesNotExist:
            return Response({'error': 'Permiso no encontrado.'}, status=404)

    @action(detail=True, methods=['post'])
    def quitar_permiso(self, request, pk=None):
        rol = self.get_object()
        permiso_id = request.data.get('permiso_id')
        try:
            permiso = Permiso.objects.get(id=permiso_id)
            rol.permisos.remove(permiso)
            return Response(RolSerializer(rol).data)
        except Permiso.DoesNotExist:
            return Response({'error': 'Permiso no encontrado.'}, status=404)

    def destroy(self, request, *args, **kwargs):
        rol = self.get_object()
        usuarios_con_rol = rol.usuarios.count()
        confirmado = request.query_params.get('confirmado', 'false').lower() == 'true'

        if usuarios_con_rol > 0 and not confirmado:
            return Response({
                'advertencia': f'Este rol tiene {usuarios_con_rol} usuario(s) asignado(s). Al eliminarlo quedarán sin rol.',
                'usuarios_afectados': list(rol.usuarios.values('id', 'username')),
                'confirmar_url': f'/api/roles/{rol.id}/?confirmado=true',
            }, status=200)

        return super().destroy(request, *args, **kwargs)