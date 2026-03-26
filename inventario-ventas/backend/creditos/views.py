from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from .models import CuentaCredito, MovimientoCredito
from .serializers import CuentaCreditoSerializer, MovimientoCreditoSerializer, AbonoSerializer
from usuarios.permissions import PuedeVerCreditos, PuedeAbonar


class CuentaCreditoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CuentaCredito.objects.select_related('cliente').prefetch_related('movimientos')
    serializer_class = CuentaCreditoSerializer
    permission_classes = [PuedeVerCreditos]

    @action(detail=True, methods=['post'])
    def abonar(self, request, pk=None):
        if not PuedeAbonar().has_permission(request, self):
            return Response({'error': 'No tienes permiso para registrar abonos.'}, status=403)

        cuenta = self.get_object()
        serializer = AbonoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data['monto'] <= 0:
            return Response({'error': 'El monto debe ser mayor a 0.'}, status=400)
        if data['monto'] > cuenta.saldo_usado:
            return Response({
                'error': f'El monto excede la deuda actual de ${cuenta.saldo_usado:,.0f}'
            }, status=400)

        with transaction.atomic():
            cuenta.saldo_usado -= data['monto']
            cuenta.save()
            MovimientoCredito.objects.create(
                cuenta=cuenta,
                tipo='abono',
                monto=data['monto'],
                usuario=request.user,
                metodo_pago=data.get('metodo_pago', 'efectivo'),
                notas=data.get('notas', ''),
            )

            from notificaciones.models import Notificacion, TipoNotificacion, ConfiguracionNotificacion
            try:
                tipo = TipoNotificacion.objects.get(codigo='abono_registrado')
                roles_activos = ConfiguracionNotificacion.objects.filter(
                    tipo=tipo, activa=True
                ).select_related('rol')
                for config in roles_activos:
                    Notificacion.objects.create(
                        tipo=tipo,
                        titulo=f'Abono registrado — {cuenta.cliente.nombre}',
                        mensaje=f'{request.user.username} registró un abono de ${data["monto"]:,.0f} de {cuenta.cliente.nombre}.',
                        destinatario_rol=config.rol,
                        referencia_id=cuenta.id,
                        referencia_tipo='cuenta_credito',
                    )
            except TipoNotificacion.DoesNotExist:
                pass

        return Response(CuentaCreditoSerializer(cuenta).data)

    @action(detail=True, methods=['get'])
    def ventas(self, request, pk=None):
        cuenta = self.get_object()
        from ventas.models import Venta

        ventas_qs = Venta.objects.filter(
            cliente_credito=cuenta.cliente,
            es_credito=True,
            estado='completada',
        ).select_related('ticket').prefetch_related('items__producto').order_by('-completada')

        # Build abono-por-ticket lookup from prefetched movimientos
        abonos_por_ticket = {}
        for m in cuenta.movimientos.all():
            if m.tipo == 'abono' and m.ticket_id:
                abonos_por_ticket[m.ticket_id] = abonos_por_ticket.get(m.ticket_id, 0) + float(m.monto)

        data = []
        for v in ventas_qs:
            items = []
            for item in v.items.all():
                if item.es_producto_comun:
                    desc = item.producto_comun_nombre or 'Artículo común'
                elif item.producto:
                    desc = item.producto.nombre
                else:
                    desc = '(producto eliminado)'
                precio_costo = (
                    str(item.producto.precio_costo)
                    if item.producto and not item.es_producto_comun
                    else '0'
                )
                items.append({
                    'descripcion': desc,
                    'precio_unitario': str(item.precio_unitario),
                    'precio_costo': precio_costo,
                    'cantidad': str(item.cantidad),
                    'subtotal': str(item.subtotal),
                    'producto_id': item.producto.id if item.producto and not item.es_producto_comun else None,
                })
            try:
                ticket_id = v.ticket.id
                numero = v.ticket.numero
            except Exception:
                ticket_id = None
                numero = str(v.id)

            abonado = abonos_por_ticket.get(ticket_id, 0) if ticket_id else 0
            liquidado = abonado >= float(v.total) and float(v.total) > 0

            data.append({
                'id': v.id,
                'numero': numero,
                'total': str(v.total),
                'fecha': v.completada.isoformat() if v.completada else v.creada.isoformat(),
                'liquidado': liquidado,
                'items': items,
            })

        return Response(data)


class MovimientoCreditoViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MovimientoCreditoSerializer
    permission_classes = [PuedeVerCreditos]

    def get_queryset(self):
        qs = MovimientoCredito.objects.select_related(
            'usuario', 'ticket', 'cuenta__cliente'
        ).order_by('-fecha')
        cuenta_id = self.request.query_params.get('cuenta_id')
        tipo = self.request.query_params.get('tipo')
        if cuenta_id:
            qs = qs.filter(cuenta_id=cuenta_id)
        if tipo:
            qs = qs.filter(tipo=tipo)
        return qs
