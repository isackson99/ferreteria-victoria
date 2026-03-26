from rest_framework import viewsets, filters
from .models import ClienteCredito, ClienteFactura
from .serializers import ClienteCreditoSerializer, ClienteFacturaSerializer
from usuarios.permissions import EsAdmin, PuedeVender


class ClienteCreditoViewSet(viewsets.ModelViewSet):
    queryset = ClienteCredito.objects.select_related('cuenta').filter(activo=True)
    serializer_class = ClienteCreditoSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [EsAdmin()]
        return [PuedeVender()]


class ClienteFacturaViewSet(viewsets.ModelViewSet):
    queryset = ClienteFactura.objects.order_by('nombre')
    serializer_class = ClienteFacturaSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['rut', 'nombre']

    def get_permissions(self):
        return [PuedeVender()]