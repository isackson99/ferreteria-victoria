from rest_framework import viewsets, filters
from .models import ClienteCredito, ClienteFactura
from .serializers import ClienteCreditoSerializer, ClienteFacturaSerializer
from usuarios.permissions import PuedeVender, PuedeCrearClienteCredito, PuedeCrearClienteFactura


class ClienteCreditoViewSet(viewsets.ModelViewSet):
    queryset = ClienteCredito.objects.select_related('cuenta').filter(activo=True)
    serializer_class = ClienteCreditoSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [PuedeCrearClienteCredito()]
        return [PuedeVender()]

    def perform_create(self, serializer):
        instance = serializer.save()
        try:
            from logs.views import log_evento
            log_evento(self.request, 'CLIENTE', 'clientes_credito',
                       f'Cliente crédito creado: {instance.nombre}',
                       datos_extra={'id': instance.id, 'nombre': instance.nombre})
        except Exception:
            pass

    def perform_update(self, serializer):
        instance = serializer.save()
        try:
            from logs.views import log_evento
            log_evento(self.request, 'CLIENTE', 'clientes_credito',
                       f'Cliente crédito editado: {instance.nombre}',
                       datos_extra={'id': instance.id, 'nombre': instance.nombre})
        except Exception:
            pass

    def perform_destroy(self, instance):
        nombre = instance.nombre
        instance.delete()
        try:
            from logs.views import log_evento
            log_evento(self.request, 'CLIENTE', 'clientes_credito',
                       f'Cliente crédito eliminado: {nombre}',
                       nivel='WARNING',
                       datos_extra={'nombre': nombre})
        except Exception:
            pass


class ClienteFacturaViewSet(viewsets.ModelViewSet):
    queryset = ClienteFactura.objects.order_by('nombre')
    serializer_class = ClienteFacturaSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['rut', 'nombre']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [PuedeCrearClienteFactura()]
        return [PuedeVender()]

    def perform_create(self, serializer):
        instance = serializer.save()
        try:
            from logs.views import log_evento
            log_evento(self.request, 'CLIENTE', 'clientes_factura',
                       f'Cliente factura creado: {instance.nombre} ({instance.rut})',
                       datos_extra={'id': instance.id, 'nombre': instance.nombre, 'rut': instance.rut})
        except Exception:
            pass

    def perform_update(self, serializer):
        instance = serializer.save()
        try:
            from logs.views import log_evento
            log_evento(self.request, 'CLIENTE', 'clientes_factura',
                       f'Cliente factura editado: {instance.nombre} ({instance.rut})',
                       datos_extra={'id': instance.id, 'nombre': instance.nombre, 'rut': instance.rut})
        except Exception:
            pass

    def perform_destroy(self, instance):
        nombre = instance.nombre
        rut = instance.rut
        instance.delete()
        try:
            from logs.views import log_evento
            log_evento(self.request, 'CLIENTE', 'clientes_factura',
                       f'Cliente factura eliminado: {nombre} ({rut})',
                       nivel='WARNING',
                       datos_extra={'nombre': nombre, 'rut': rut})
        except Exception:
            pass