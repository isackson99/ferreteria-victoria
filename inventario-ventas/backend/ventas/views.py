from datetime import datetime

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from .models import Venta, DetalleVenta, Ticket, PagoTicket, MovimientoCaja, Cotizacion, CotizacionItem
from .serializers import VentaSerializer, AgregarItemSerializer, ConfirmarVentaSerializer, TicketSerializer, CotizacionSerializer
from productos.models import Producto
from clientes.models import ClienteCredito
from creditos.models import CuentaCredito, MovimientoCredito
from usuarios.permissions import PuedeVender, PuedeCancelarVentas


class VentaViewSet(viewsets.ModelViewSet):
    serializer_class = VentaSerializer

    def get_permissions(self):
        if self.action == 'cancelar':
            return [PuedeCancelarVentas()]
        return [PuedeVender()]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser or (user.rol and user.rol.nombre.lower() == 'admin'):
            return Venta.objects.all().select_related(
                'usuario', 'cliente_credito', 'cliente_factura'
            ).prefetch_related('items__producto')
        return Venta.objects.filter(
            usuario=user
        ).select_related(
            'usuario', 'cliente_credito', 'cliente_factura'
        ).prefetch_related('items__producto')

    def perform_create(self, serializer):
        instance = serializer.save(usuario=self.request.user)
        try:
            from logs.views import log_evento
            log_evento(self.request, 'VENTA', 'ventas',
                       f'Ticket #{instance.id} abierto',
                       ticket_id=instance.id)
        except Exception:
            pass

    @action(detail=True, methods=['post'])
    def agregar_item(self, request, pk=None):
        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        serializer = AgregarItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            producto = Producto.objects.get(id=data['producto_id'], activo=True)
        except Producto.DoesNotExist:
            return Response({'error': 'Producto no encontrado.'}, status=404)

        if producto.tipo == 'kit':
            if not hasattr(producto, 'kit') or not producto.kit.componentes.exists():
                return Response({'error': 'Este kit no tiene componentes configurados.'}, status=400)
            componentes_simples = producto.kit.obtener_componentes_simples(data['cantidad'])
            for comp_data in componentes_simples.values():
                if comp_data['producto'].inventario_actual < comp_data['cantidad']:
                    return Response({
                        'error': (
                            f'Stock insuficiente: "{comp_data["producto"].nombre}" '
                            f'(necesario: {comp_data["cantidad"]}, '
                            f'disponible: {comp_data["producto"].inventario_actual})'
                        )
                    }, status=400)
        elif producto.usa_inventario and producto.inventario_actual < data['cantidad']:
            return Response({
                'error': f'Stock insuficiente. Disponible: {producto.inventario_actual}'
            }, status=400)

        usar_mayoreo = data['usar_precio_mayoreo'] and producto.aplica_mayoreo(data['cantidad'])
        precio = producto.precio_mayoreo if usar_mayoreo else producto.precio_venta
        precio_tipo = 'mayoreo' if usar_mayoreo else ('kit' if producto.tipo == 'kit' else 'normal')

        item, creado = DetalleVenta.objects.get_or_create(
            venta=venta,
            producto=producto,
            defaults={
                'cantidad': data['cantidad'],
                'precio_unitario': precio,
                'precio_tipo': precio_tipo,
            }
        )
        if not creado:
            nueva_cantidad = item.cantidad + data['cantidad']
            if producto.tipo == 'kit':
                if hasattr(producto, 'kit'):
                    componentes_simples = producto.kit.obtener_componentes_simples(nueva_cantidad)
                    for comp_data in componentes_simples.values():
                        if comp_data['producto'].inventario_actual < comp_data['cantidad']:
                            return Response({
                                'error': (
                                    f'Stock insuficiente: "{comp_data["producto"].nombre}" '
                                    f'(necesario: {comp_data["cantidad"]}, '
                                    f'disponible: {comp_data["producto"].inventario_actual})'
                                )
                            }, status=400)
            elif producto.usa_inventario and nueva_cantidad > producto.inventario_actual:
                return Response({
                    'error': f'Stock insuficiente. Disponible: {producto.inventario_actual}, en carrito: {item.cantidad}'
                }, status=400)
            item.cantidad = nueva_cantidad
            item.precio_unitario = precio
            item.save()

        venta.calcular_total()
        try:
            from logs.views import log_evento
            accion = 'Producto sumado' if not creado else 'Producto agregado'
            log_evento(request, 'VENTA', 'ventas',
                       f'{accion}: {producto.nombre} x{data["cantidad"]} @${float(precio):,.0f}',
                       ticket_id=venta.id,
                       datos_extra={
                           'producto_id': producto.id,
                           'codigo': producto.codigo,
                           'nombre': producto.nombre,
                           'cantidad': float(data['cantidad']),
                           'precio': float(precio),
                           'precio_tipo': precio_tipo,
                           'creado': creado,
                       })
        except Exception:
            pass
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=True, methods=['delete'], url_path='quitar_item/(?P<item_id>[^/.]+)')
    def quitar_item(self, request, pk=None, item_id=None):
        venta = self.get_object()
        try:
            item = DetalleVenta.objects.select_related('producto').get(id=item_id, venta=venta)
            item_nombre = item.producto_comun_nombre if item.es_producto_comun else (item.producto.nombre if item.producto else '?')
            item_precio = float(item.precio_unitario)
            item_cant   = float(item.cantidad)
            item.delete()
            venta.calcular_total()
            try:
                from logs.views import log_evento
                log_evento(request, 'VENTA', 'ventas',
                           f'Producto quitado: {item_nombre}',
                           ticket_id=venta.id,
                           datos_extra={'nombre': item_nombre, 'cantidad': item_cant, 'precio': item_precio})
            except Exception:
                pass
            venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
            return Response(VentaSerializer(venta).data)
        except DetalleVenta.DoesNotExist:
            return Response({'error': 'Item no encontrado.'}, status=404)

    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        venta = self.get_object()
        if venta.estado == 'completada':
            try:
                ticket = Ticket.objects.get(venta=venta)
                return Response(TicketSerializer(ticket).data, status=200)
            except Ticket.DoesNotExist:
                pass
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)
        if not venta.items.exists():
            return Response({'error': 'La venta no tiene productos.'}, status=400)

        serializer = ConfirmarVentaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            if data['metodo'] == 'credito':
                if not data.get('cliente_credito_id'):
                    return Response({'error': 'Debes seleccionar un cliente crédito.'}, status=400)
                try:
                    cliente = ClienteCredito.objects.get(id=data['cliente_credito_id'], activo=True)
                    cuenta, _ = CuentaCredito.objects.get_or_create(cliente=cliente)
                except ClienteCredito.DoesNotExist:
                    return Response({'error': 'Cliente crédito no encontrado.'}, status=404)

                if not cuenta.puede_comprar(venta.total):
                    return Response({
                        'error': f'El cliente no tiene saldo suficiente. Disponible: ${cuenta.saldo_disponible:,.0f}'
                    }, status=400)

            for item in venta.items.select_related('producto__kit'):
                if item.es_producto_comun or not item.producto:
                    continue
                if item.producto.tipo == 'kit':
                    componentes = item.producto.kit.obtener_componentes_simples(item.cantidad)
                    for comp_data in componentes.values():
                        if comp_data['producto'].inventario_actual < comp_data['cantidad']:
                            return Response({
                                'error': (
                                    f'Stock insuficiente: "{comp_data["producto"].nombre}" '
                                    f'(kit: {item.producto.nombre}). '
                                    f'Necesario: {comp_data["cantidad"]}, '
                                    f'disponible: {comp_data["producto"].inventario_actual}'
                                )
                            }, status=400)
                else:
                    if item.producto.inventario_actual < item.cantidad:
                        return Response({
                            'error': f'Stock insuficiente para {item.producto.nombre}'
                        }, status=400)

            venta.estado = 'completada'
            venta.completada = timezone.now()
            if data['metodo'] == 'credito':
                venta.es_credito = True
                venta.cliente_credito = cliente
            venta.save()

            fecha = timezone.localtime(timezone.now()).strftime('%Y%m%d')
            numero = f"TKT-{fecha}-{str(venta.id).zfill(4)}"
            ticket = Ticket.objects.create(venta=venta, numero=numero)

            pago = PagoTicket(
                ticket=ticket,
                metodo=data['metodo'],
                monto_total=venta.total,
                monto_recibido=data.get('monto_recibido', 0),
                monto_tarjeta=data.get('monto_tarjeta', 0),
            )
            if data['metodo'] == 'credito':
                pago.cliente_credito = cliente
            pago.save()

            if data['metodo'] == 'credito':
                cuenta.saldo_usado += venta.total
                cuenta.save()
                MovimientoCredito.objects.create(
                    cuenta=cuenta,
                    tipo='cargo',
                    monto=venta.total,
                    ticket=ticket,
                    usuario=request.user,
                )


        try:
            from logs.views import log_evento
            cliente_nombre = venta.cliente_credito.nombre if venta.es_credito and venta.cliente_credito else None
            log_evento(request, 'VENTA', 'ventas',
                       f'Venta cobrada — ${float(venta.total):,.0f} ({data["metodo"]})',
                       ticket_id=venta.id,
                       datos_extra={
                           'ticket_numero': ticket.numero,
                           'total': float(venta.total),
                           'metodo': data['metodo'],
                           'cliente': cliente_nombre,
                       })
        except Exception:
            pass
        return Response(TicketSerializer(ticket).data, status=201)

    @action(detail=True, methods=['post'])
    def asignar_cliente_factura(self, request, pk=None):
        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'No se puede modificar una venta completada.'}, status=400)

        cliente_id = request.data.get('cliente_factura_id')

        if cliente_id is None:
            venta.cliente_factura = None
        else:
            from clientes.models import ClienteFactura
            try:
                cliente = ClienteFactura.objects.get(id=cliente_id, activo=True)
                venta.cliente_factura = cliente
            except ClienteFactura.DoesNotExist:
                return Response({'error': 'Cliente no encontrado.'}, status=404)

        venta.save()
        try:
            from logs.views import log_evento
            from clientes.models import ClienteFactura as _CF
            cf = _CF.objects.filter(id=cliente_id).values('nombre', 'rut').first() if cliente_id else None
            log_evento(request, 'VENTA', 'ventas',
                       f'Cliente factura {"asignado: " + cf["nombre"] if cf else "desasignado"}',
                       ticket_id=venta.id,
                       datos_extra={'cliente_id': cliente_id, 'cliente': cf})
        except Exception:
            pass
        venta = Venta.objects.select_related(
            'usuario', 'cliente_credito', 'cliente_factura'
        ).prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Solo se pueden cancelar ventas pendientes.'}, status=400)
        venta.estado = 'cancelada'
        venta.save()
        try:
            from logs.views import log_evento
            log_evento(request, 'VENTA', 'ventas',
                       f'Ticket #{venta.id} cancelado',
                       ticket_id=venta.id, nivel='WARNING')
        except Exception:
            pass
        return Response({'mensaje': 'Venta cancelada.'})

    @action(detail=True, methods=['post'])
    def agregar_producto_comun(self, request, pk=None):
        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        nombre = request.data.get('nombre', 'Producto común')
        cantidad = request.data.get('cantidad', 1)
        precio = request.data.get('precio', 0)

        if float(precio) < 0:
            return Response({'error': 'El precio no puede ser negativo.'}, status=400)
        if float(cantidad) == 0:
            return Response({'error': 'La cantidad no puede ser 0.'}, status=400)

        DetalleVenta.objects.create(
            venta=venta,
            producto=None,
            es_producto_comun=True,
            producto_comun_nombre=nombre,
            cantidad=cantidad,
            precio_unitario=precio,
            precio_tipo='comun',
        )
        try:
            from logs.views import log_evento
            log_evento(request, 'VENTA', 'ventas',
                       f'Artículo común: "{nombre}" x{cantidad} @${float(precio):,.0f}',
                       ticket_id=venta.id,
                       datos_extra={'nombre': nombre, 'cantidad': float(cantidad), 'precio': float(precio)})
        except Exception:
            pass
        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=False, methods=['get'])
    def tickets_abiertos(self, request):
        tickets = Venta.objects.filter(
            usuario=request.user,
            estado='pendiente'
        ).prefetch_related('items__producto').order_by('creada')
        return Response(VentaSerializer(tickets, many=True).data)

    @action(detail=False, methods=['post'])
    def nuevo_ticket(self, request):
        venta = Venta.objects.create(usuario=request.user)
        try:
            from logs.views import log_evento
            log_evento(request, 'VENTA', 'ventas',
                       f'Ticket #{venta.id} abierto',
                       ticket_id=venta.id)
        except Exception:
            pass
        return Response(VentaSerializer(venta).data, status=201)

    @action(detail=True, methods=['post'])
    def devolver(self, request, pk=None):
        from productos.signals import notificar_stock_actualizado, crear_notificacion_stock
        from productos.models import MovimientoInventario
        from django.db import transaction

        venta = self.get_object()

        if venta.estado != 'completada':
            return Response({'error': 'Solo se pueden devolver ventas completadas.'}, status=400)

        with transaction.atomic():
            for item in venta.items.select_related('producto__kit'):
                if item.es_producto_comun:
                    continue
                if item.producto.tipo == 'kit':
                    componentes = item.producto.kit.obtener_componentes_simples(item.cantidad)
                    for data in componentes.values():
                        p = data['producto']
                        stock_antes = p.inventario_actual
                        p.inventario_actual += data['cantidad']
                        p.save()
                        MovimientoInventario.objects.create(
                            producto=p,
                            tipo='devolucion',
                            cantidad=data['cantidad'],
                            stock_antes=stock_antes,
                            stock_despues=p.inventario_actual,
                            motivo=f'Devolución venta #{venta.id} (kit {item.producto.nombre})',
                            usuario=request.user,
                            referencia_venta=venta,
                        )
                        notificar_stock_actualizado(p)
                        crear_notificacion_stock(p)
                else:
                    stock_antes = item.producto.inventario_actual
                    item.producto.inventario_actual += item.cantidad
                    item.producto.save()
                    MovimientoInventario.objects.create(
                        producto=item.producto,
                        tipo='devolucion',
                        cantidad=item.cantidad,
                        stock_antes=stock_antes,
                        stock_despues=item.producto.inventario_actual,
                        motivo=f'Devolución venta #{venta.id}',
                        usuario=request.user,
                        referencia_venta=venta,
                    )
                    notificar_stock_actualizado(item.producto)
                    crear_notificacion_stock(item.producto)

            if venta.es_credito and venta.cliente_credito:
                from creditos.models import CuentaCredito, MovimientoCredito
                try:
                    cuenta = CuentaCredito.objects.get(cliente=venta.cliente_credito)
                    cuenta.saldo_usado = max(cuenta.saldo_usado - venta.total, 0)
                    cuenta.save()
                    MovimientoCredito.objects.create(
                        cuenta=cuenta,
                        tipo='abono',
                        monto=venta.total,
                        usuario=request.user,
                        notas=f'Devolución de venta #{venta.id}',
                    )
                except CuentaCredito.DoesNotExist:
                    pass

            venta.estado = 'cancelada'
            venta.save()

        try:
            from logs.views import log_evento
            log_evento(request, 'VENTA', 'ventas',
                       f'Devolución completa venta #{venta.id} — ${float(venta.total):,.0f}',
                       ticket_id=venta.id, nivel='WARNING',
                       datos_extra={'total': float(venta.total), 'es_credito': venta.es_credito})
        except Exception:
            pass
        return Response({'mensaje': f'Venta #{venta.id} devuelta correctamente. Inventario restaurado.'})

    @action(detail=False, methods=['get'])
    def ultimo_ticket(self, request):
        from ventas.models import Ticket
        ticket = Ticket.objects.filter(
            venta__usuario=request.user,
            venta__estado='completada'
        ).order_by('-generado').first()

        if not ticket:
            return Response({'error': 'No hay tickets anteriores.'}, status=404)

        venta = ticket.venta
        return Response({
            'ticket': {
                'numero': ticket.numero,
                'generado': ticket.generado,
            },
            'venta': {
                'id': venta.id,
                'usuario': venta.usuario.username,
                'es_credito': venta.es_credito,
                'cliente_credito': venta.cliente_credito.nombre if venta.cliente_credito else None,
                'cliente_factura': {
                    'nombre':    venta.cliente_factura.nombre,
                    'rut':       venta.cliente_factura.rut,
                    'correo':    venta.cliente_factura.correo,
                    'telefono':  venta.cliente_factura.telefono,
                } if venta.cliente_factura else None,
                'total': venta.total,
                'completada': venta.completada,
            },
            'productos': [
                {
                    'nombre': item.producto_comun_nombre if item.es_producto_comun else item.producto.nombre,
                    'codigo': None if item.es_producto_comun else item.producto.codigo,
                    'cantidad': item.cantidad,
                    'precio_unitario': item.precio_unitario,
                    'precio_tipo': item.precio_tipo,
                    'subtotal': item.subtotal,
                }
                for item in venta.items.all()
            ],
            'pagos': [
                {
                    'metodo': p.metodo,
                    'monto_total': p.monto_total,
                    'monto_efectivo': p.monto_efectivo,
                    'monto_tarjeta': p.monto_tarjeta,
                    'monto_recibido': p.monto_recibido,
                    'vuelto': p.vuelto,
                }
                for p in ticket.pagos.all()
            ],
        })


    @action(detail=True, methods=['post'])
    def cambiar_cantidad(self, request, pk=None):
        """Incrementa o decrementa la cantidad de un item. delta puede ser positivo o negativo."""
        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        item_id = request.data.get('item_id')
        from decimal import Decimal, InvalidOperation
        try:
            delta = Decimal(str(request.data.get('delta', 0)))
        except (InvalidOperation, TypeError):
            return Response({'error': 'Delta inválido.'}, status=400)

        if delta == 0:
            return Response({'error': 'El delta no puede ser 0.'}, status=400)

        try:
            item = DetalleVenta.objects.select_related('producto').get(id=item_id, venta=venta)
        except DetalleVenta.DoesNotExist:
            return Response({'error': 'Item no encontrado.'}, status=404)

        nueva_cantidad = item.cantidad + delta
        if nueva_cantidad <= 0:
            return Response({'error': 'Use quitar_item para eliminar el producto.'}, status=400)

        if delta > 0 and item.producto:
            prod = item.producto
            if prod.tipo == 'kit':
                if hasattr(prod, 'kit'):
                    componentes_simples = prod.kit.obtener_componentes_simples(nueva_cantidad)
                    for comp_data in componentes_simples.values():
                        if comp_data['producto'].inventario_actual < comp_data['cantidad']:
                            return Response({
                                'error': (
                                    f'Stock insuficiente: "{comp_data["producto"].nombre}" '
                                    f'(necesario: {comp_data["cantidad"]}, '
                                    f'disponible: {comp_data["producto"].inventario_actual})'
                                )
                            }, status=400)
            elif prod.usa_inventario and nueva_cantidad > prod.inventario_actual:
                return Response({
                    'error': f'Stock insuficiente. Disponible: {prod.inventario_actual}'
                }, status=400)

        cantidad_anterior = item.cantidad
        item.cantidad = nueva_cantidad
        item.save()
        try:
            from logs.views import log_evento
            nombre = item.producto_comun_nombre if item.es_producto_comun else (item.producto.nombre if item.producto else '?')
            log_evento(request, 'VENTA', 'ventas',
                       f'Cantidad modificada: {nombre} {float(cantidad_anterior)} → {float(nueva_cantidad)}',
                       ticket_id=venta.id,
                       datos_extra={'nombre': nombre, 'cantidad_anterior': float(cantidad_anterior),
                                    'cantidad_nueva': float(nueva_cantidad), 'delta': float(delta)})
        except Exception:
            pass
        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=True, methods=['post'])
    def aplicar_mayoreo(self, request, pk=None):
        """Aplica o revierte el precio mayoreo en un item específico."""
        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        item_id = request.data.get('item_id')
        activar = request.data.get('activar', True)

        try:
            item = DetalleVenta.objects.select_related('producto').get(id=item_id, venta=venta)
        except DetalleVenta.DoesNotExist:
            return Response({'error': 'Item no encontrado.'}, status=404)

        if item.es_producto_comun or not item.producto:
            return Response({'error': 'No aplica a artículos comunes.'}, status=400)

        producto = item.producto

        if activar:
            if not producto.precio_mayoreo or producto.precio_mayoreo <= 0:
                return Response({'error': 'Este producto no tiene precio mayoreo configurado.'}, status=400)
            item.precio_unitario = producto.precio_mayoreo
            item.precio_tipo = 'mayoreo'
        else:
            item.precio_unitario = producto.precio_venta
            item.precio_tipo = 'kit' if producto.tipo == 'kit' else 'normal'

        item.save()
        try:
            from logs.views import log_evento
            log_evento(request, 'VENTA', 'ventas',
                       f'Mayoreo {"activado" if activar else "revertido"}: {producto.nombre}',
                       ticket_id=venta.id,
                       datos_extra={
                           'producto': producto.nombre,
                           'precio_anterior': float(producto.precio_venta) if not activar else float(producto.precio_mayoreo or 0),
                           'precio_nuevo': float(item.precio_unitario),
                           'activar': activar,
                       })
        except Exception:
            pass
        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)


    @action(detail=False, methods=['get'])
    def ventas_del_dia(self, request):
        """Lista ventas completadas/clausuradas del día. Admin ve todas; cajero solo las suyas."""
        import pytz
        from datetime import datetime as dt

        fecha_str = request.query_params.get('fecha')
        cajero_id = request.query_params.get('cajero_id')
        tz = pytz.timezone('America/Santiago')

        if fecha_str:
            try:
                fecha = dt.strptime(fecha_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Formato de fecha inválido.'}, status=400)
        else:
            fecha = dt.now(tz).date()

        user = request.user
        is_admin = user.is_superuser or (user.rol and user.rol.nombre.lower() in ['admin', 'administrador'])

        inicio = tz.localize(dt.combine(fecha, dt.min.time()))
        fin = tz.localize(dt.combine(fecha, dt.max.time()))

        qs = Venta.objects.filter(
            estado__in=['completada', 'clausurada'],
            completada__range=(inicio, fin),
        ).select_related(
            'usuario', 'cliente_credito', 'cliente_factura'
        ).prefetch_related('items__producto', 'ticket__pagos')

        if is_admin and cajero_id:
            qs = qs.filter(usuario_id=cajero_id)
        elif not is_admin:
            qs = qs.filter(usuario=user)

        result = []
        for venta in qs.order_by('-completada'):
            ticket = getattr(venta, 'ticket', None)
            items = []
            for item in venta.items.all():
                nombre = (
                    item.producto_comun_nombre if item.es_producto_comun
                    else (item.producto.nombre if item.producto else '-')
                )
                items.append({
                    'id': item.id,
                    'nombre': nombre,
                    'cantidad': float(item.cantidad),
                    'precio_unitario': float(item.precio_unitario),
                    'subtotal': float(item.subtotal),
                    'precio_tipo': item.precio_tipo,
                    'es_producto_comun': item.es_producto_comun,
                    'producto_id': item.producto_id,
                })
            pagos = []
            if ticket:
                for pago in ticket.pagos.all():
                    pagos.append({
                        'metodo': pago.metodo,
                        'metodo_display': pago.get_metodo_display(),
                        'monto_total': float(pago.monto_total),
                        'monto_recibido': float(pago.monto_recibido),
                        'vuelto': float(pago.vuelto),
                    })
            result.append({
                'id': venta.id,
                'folio': ticket.numero if ticket else f'#{venta.id}',
                'cajero': (venta.usuario.get_full_name() or venta.usuario.username) if venta.usuario else '-',
                'cajero_id': venta.usuario_id,
                'cliente': (
                    venta.cliente_credito.nombre if venta.cliente_credito
                    else (venta.cliente_factura.nombre if venta.cliente_factura else 'Público General')
                ),
                'estado': venta.estado,
                'total': float(venta.total),
                'completada': venta.completada.isoformat() if venta.completada else None,
                'items': items,
                'pagos': pagos,
            })

        return Response({'ventas': result, 'is_admin': is_admin})

    @action(detail=True, methods=['post'])
    def devolver_item(self, request, pk=None):
        """Devuelve una cantidad parcial de un ítem de una venta completada."""
        from decimal import Decimal, InvalidOperation
        from productos.models import MovimientoInventario
        from productos.signals import notificar_stock_actualizado, crear_notificacion_stock

        venta = self.get_object()
        if venta.estado != 'completada':
            return Response({'error': 'Solo se pueden hacer devoluciones en ventas completadas.'}, status=400)

        item_id = request.data.get('item_id')
        try:
            cantidad_devolver = Decimal(str(request.data.get('cantidad', 1)))
        except (InvalidOperation, TypeError):
            return Response({'error': 'Cantidad inválida.'}, status=400)

        if cantidad_devolver <= 0:
            return Response({'error': 'La cantidad a devolver debe ser mayor a 0.'}, status=400)

        try:
            item = DetalleVenta.objects.select_related('producto__kit').get(id=item_id, venta=venta)
        except DetalleVenta.DoesNotExist:
            return Response({'error': 'Item no encontrado.'}, status=404)

        if item.es_producto_comun or not item.producto:
            return Response({'error': 'No se pueden devolver artículos comunes.'}, status=400)

        if cantidad_devolver > item.cantidad:
            return Response({'error': f'No puede devolver más de {item.cantidad} unidades.'}, status=400)

        with transaction.atomic():
            producto = item.producto
            if producto.tipo == 'kit':
                componentes = producto.kit.obtener_componentes_simples(cantidad_devolver)
                for data in componentes.values():
                    p = data['producto']
                    stock_antes = p.inventario_actual
                    p.inventario_actual += data['cantidad']
                    p.save()
                    MovimientoInventario.objects.create(
                        producto=p, tipo='devolucion', cantidad=data['cantidad'],
                        stock_antes=stock_antes, stock_despues=p.inventario_actual,
                        motivo=f'Dev. parcial venta #{venta.id} (kit {producto.nombre})',
                        usuario=request.user, referencia_venta=venta,
                    )
                    notificar_stock_actualizado(p)
                    crear_notificacion_stock(p)
            else:
                stock_antes = producto.inventario_actual
                producto.inventario_actual += cantidad_devolver
                producto.save()
                MovimientoInventario.objects.create(
                    producto=producto, tipo='devolucion', cantidad=cantidad_devolver,
                    stock_antes=stock_antes, stock_despues=producto.inventario_actual,
                    motivo=f'Dev. parcial venta #{venta.id}',
                    usuario=request.user, referencia_venta=venta,
                )
                notificar_stock_actualizado(producto)
                crear_notificacion_stock(producto)

            if cantidad_devolver == item.cantidad:
                item.delete()
            else:
                item.cantidad -= cantidad_devolver
                item.save()

            venta.calcular_total()

        # Refrescar y retornar datos actualizados
        venta = Venta.objects.select_related(
            'usuario', 'cliente_credito', 'cliente_factura'
        ).prefetch_related('items__producto', 'ticket__pagos').get(id=venta.id)

        ticket = getattr(venta, 'ticket', None)
        items = []
        for i in venta.items.all():
            nombre = i.producto_comun_nombre if i.es_producto_comun else (i.producto.nombre if i.producto else '-')
            items.append({
                'id': i.id, 'nombre': nombre,
                'cantidad': float(i.cantidad), 'precio_unitario': float(i.precio_unitario),
                'subtotal': float(i.subtotal), 'precio_tipo': i.precio_tipo,
                'es_producto_comun': i.es_producto_comun, 'producto_id': i.producto_id,
            })
        pagos = []
        if ticket:
            for pago in ticket.pagos.all():
                pagos.append({
                    'metodo': pago.metodo, 'metodo_display': pago.get_metodo_display(),
                    'monto_total': float(pago.monto_total), 'monto_recibido': float(pago.monto_recibido),
                    'vuelto': float(pago.vuelto),
                })

        return Response({
            'mensaje': f'{cantidad_devolver} unidad(es) devuelta(s).',
            'venta': {
                'id': venta.id, 'estado': venta.estado,
                'total': float(venta.total), 'items': items, 'pagos': pagos,
            }
        })

    @action(detail=True, methods=['post'])
    def clausurar(self, request, pk=None):
        """Clausura una venta completada restaurando todo el inventario."""
        from productos.models import MovimientoInventario
        from productos.signals import notificar_stock_actualizado, crear_notificacion_stock

        venta = self.get_object()
        if venta.estado != 'completada':
            return Response({'error': 'Solo se pueden clausurar ventas completadas.'}, status=400)

        with transaction.atomic():
            for item in venta.items.select_related('producto__kit'):
                if item.es_producto_comun or not item.producto:
                    continue
                if item.producto.tipo == 'kit':
                    componentes = item.producto.kit.obtener_componentes_simples(item.cantidad)
                    for data in componentes.values():
                        p = data['producto']
                        stock_antes = p.inventario_actual
                        p.inventario_actual += data['cantidad']
                        p.save()
                        MovimientoInventario.objects.create(
                            producto=p, tipo='devolucion', cantidad=data['cantidad'],
                            stock_antes=stock_antes, stock_despues=p.inventario_actual,
                            motivo=f'Clausura venta #{venta.id} (kit {item.producto.nombre})',
                            usuario=request.user, referencia_venta=venta,
                        )
                        notificar_stock_actualizado(p)
                        crear_notificacion_stock(p)
                else:
                    stock_antes = item.producto.inventario_actual
                    item.producto.inventario_actual += item.cantidad
                    item.producto.save()
                    MovimientoInventario.objects.create(
                        producto=item.producto, tipo='devolucion', cantidad=item.cantidad,
                        stock_antes=stock_antes, stock_despues=item.producto.inventario_actual,
                        motivo=f'Clausura venta #{venta.id}',
                        usuario=request.user, referencia_venta=venta,
                    )
                    notificar_stock_actualizado(item.producto)
                    crear_notificacion_stock(item.producto)

            if venta.es_credito and venta.cliente_credito:
                from creditos.models import CuentaCredito, MovimientoCredito
                try:
                    cuenta = CuentaCredito.objects.get(cliente=venta.cliente_credito)
                    cuenta.saldo_usado = max(cuenta.saldo_usado - venta.total, 0)
                    cuenta.save()
                    MovimientoCredito.objects.create(
                        cuenta=cuenta, tipo='abono', monto=venta.total,
                        usuario=request.user, notas=f'Clausura venta #{venta.id}',
                    )
                except CuentaCredito.DoesNotExist:
                    pass

            venta.estado = 'clausurada'
            venta.save()

        return Response({'mensaje': f'Venta #{venta.id} clausurada. Inventario restaurado.'})

    @action(detail=True, methods=['post'])
    def agregar_descuento(self, request, pk=None):
        """Agrega un ítem de descuento (precio negativo) al ticket activo."""
        from decimal import Decimal, InvalidOperation

        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        try:
            monto = Decimal(str(request.data.get('monto', 0)))
            porcentaje = Decimal(str(request.data.get('porcentaje', 0)))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Datos inválidos.'}, status=400)

        if monto <= 0:
            return Response({'error': 'El monto del descuento debe ser mayor a 0.'}, status=400)

        porcentaje_display = f"{float(porcentaje):.2f}".rstrip('0').rstrip('.')
        nombre = f"Descuento del {porcentaje_display}%"

        DetalleVenta.objects.create(
            venta=venta,
            producto=None,
            es_producto_comun=True,
            producto_comun_nombre=nombre,
            cantidad=1,
            precio_unitario=-monto,
            precio_tipo='descuento',
        )

        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=True, methods=['post'])
    def agregar_devolucion(self, request, pk=None):
        """Agrega un ítem con cantidad negativa al ticket activo (devolución en carrito)."""
        from decimal import Decimal, InvalidOperation

        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        try:
            producto_id = int(request.data.get('producto_id'))
            cantidad = abs(Decimal(str(request.data.get('cantidad', 1))))
            precio = Decimal(str(request.data.get('precio', 0)))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Datos inválidos.'}, status=400)

        if cantidad <= 0:
            return Response({'error': 'La cantidad debe ser mayor a 0.'}, status=400)
        if precio <= 0:
            return Response({'error': 'El precio debe ser mayor a 0.'}, status=400)

        try:
            producto = Producto.objects.get(id=producto_id, activo=True)
        except Producto.DoesNotExist:
            return Response({'error': 'Producto no encontrado.'}, status=404)

        if producto.tipo == 'kit':
            return Response({'error': 'No se pueden devolver kits directamente.'}, status=400)

        DetalleVenta.objects.create(
            venta=venta,
            producto=producto,
            cantidad=-cantidad,
            precio_unitario=precio,
            precio_tipo='devolucion',
        )

        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=True, methods=['post'])
    def confirmar_devolucion(self, request, pk=None):
        """Procesa un ticket mixto (devoluciones + compras). El signal maneja el inventario."""
        from decimal import Decimal

        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        if not venta.items.filter(precio_tipo='devolucion').exists():
            return Response({'error': 'No hay artículos de devolución en este ticket.'}, status=400)

        # Validar stock solo para ítems de compra (positivos)
        for item in venta.items.filter(cantidad__gt=0).select_related('producto__kit'):
            if item.es_producto_comun or not item.producto:
                continue
            if item.producto.tipo == 'kit':
                componentes = item.producto.kit.obtener_componentes_simples(item.cantidad)
                for data in componentes.values():
                    if data['producto'].inventario_actual < data['cantidad']:
                        return Response({
                            'error': f'Stock insuficiente: {data["producto"].nombre}'
                        }, status=400)
            elif item.producto.usa_inventario and item.producto.inventario_actual < item.cantidad:
                return Response({
                    'error': f'Stock insuficiente para {item.producto.nombre}'
                }, status=400)

        metodo = request.data.get('metodo', 'efectivo')
        monto_recibido = Decimal(str(request.data.get('monto_recibido', 0)))

        with transaction.atomic():
            # venta.save() dispara el signal que gestiona inventario para todos los ítems
            venta.estado = 'completada'
            venta.completada = timezone.now()
            venta.save()

            fecha = timezone.localtime(timezone.now()).strftime('%Y%m%d')
            numero = f"DEV-{fecha}-{str(venta.id).zfill(4)}"
            ticket = Ticket.objects.create(venta=venta, numero=numero)

            pago = PagoTicket(
                ticket=ticket,
                metodo='efectivo',
                monto_total=venta.total,
                monto_recibido=monto_recibido,
            )
            pago.save()

        return Response(TicketSerializer(ticket).data, status=201)


    @action(detail=True, methods=['patch'], url_path='actualizar_item/(?P<item_id>[^/.]+)')
    def actualizar_item(self, request, pk=None, item_id=None):
        """Actualiza la cantidad de un ítem granel en un ticket pendiente."""
        from decimal import Decimal, InvalidOperation

        venta = self.get_object()
        if venta.estado != 'pendiente':
            return Response({'error': 'Esta venta ya fue procesada.'}, status=400)

        try:
            nueva_cantidad = Decimal(str(request.data.get('cantidad')))
        except (InvalidOperation, TypeError):
            return Response({'error': 'Cantidad inválida.'}, status=400)

        if nueva_cantidad <= 0:
            return Response({'error': 'La cantidad debe ser mayor a 0.'}, status=400)

        try:
            item = DetalleVenta.objects.select_related('producto').get(id=item_id, venta=venta)
        except DetalleVenta.DoesNotExist:
            return Response({'error': 'Item no encontrado.'}, status=404)

        if item.es_producto_comun or not item.producto:
            return Response({'error': 'No aplica a artículos comunes.'}, status=400)

        producto = item.producto
        if producto.usa_inventario and nueva_cantidad > producto.inventario_actual:
            return Response({
                'error': f'Stock insuficiente. Disponible: {producto.inventario_actual}'
            }, status=400)

        item.cantidad = nueva_cantidad
        item.save()
        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)


class MovimientoCajaViewSet(viewsets.ModelViewSet):
    serializer_class = None
    permission_classes = [PuedeVender]

    def get_queryset(self):
        return MovimientoCaja.objects.filter(usuario=self.request.user)

    def list(self, request):
        from django.db.models import Sum
        import pytz

        fecha_str = request.query_params.get('fecha')
        tz = pytz.timezone('America/Santiago')

        if fecha_str:
            try:
                fecha = datetime.strptime(fecha_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Formato inválido.'}, status=400)
        else:
            from datetime import datetime as dt
            fecha = dt.now(tz).date()

        inicio = tz.localize(datetime.combine(fecha, datetime.min.time()))
        fin = tz.localize(datetime.combine(fecha, datetime.max.time()))

        movimientos = MovimientoCaja.objects.filter(
            fecha__range=(inicio, fin)
        ).select_related('usuario')

        resultado = []
        for m in movimientos:
            resultado.append({
                'id': m.id,
                'tipo': m.tipo,
                'tipo_display': m.get_tipo_display(),
                'monto': m.monto,
                'motivo': m.motivo,
                'usuario': m.usuario.username if m.usuario else None,
                'fecha': m.fecha,
            })

        total_entradas = movimientos.filter(tipo='entrada').aggregate(t=Sum('monto'))['t'] or 0
        total_salidas = movimientos.filter(tipo='salida').aggregate(t=Sum('monto'))['t'] or 0

        return Response({
            'fecha': fecha,
            'total_entradas': total_entradas,
            'total_salidas': total_salidas,
            'movimientos': resultado,
        })

    def create(self, request):
        tipo = request.data.get('tipo')
        monto = request.data.get('monto')
        motivo = request.data.get('motivo', '')

        if tipo not in ['entrada', 'salida']:
            return Response({'error': 'Tipo debe ser entrada o salida.'}, status=400)
        if not monto or float(monto) <= 0:
            return Response({'error': 'El monto debe ser mayor a 0.'}, status=400)

        m = MovimientoCaja.objects.create(
            tipo=tipo,
            monto=monto,
            motivo=motivo,
            usuario=request.user,
        )
        try:
            from logs.views import log_evento
            log_evento(request, 'CAJA', 'caja',
                       f'Movimiento caja — {tipo}: ${float(monto):,.0f} ({motivo or "sin motivo"})',
                       datos_extra={'tipo': tipo, 'monto': float(monto), 'motivo': motivo})
        except Exception:
            pass

        return Response({
            'id': m.id,
            'tipo': m.tipo,
            'monto': m.monto,
            'motivo': m.motivo,
            'usuario': request.user.username,
            'fecha': m.fecha,
        }, status=201)


class CotizacionViewSet(viewsets.ModelViewSet):
    serializer_class = CotizacionSerializer
    permission_classes = [PuedeVender]

    def get_queryset(self):
        return Cotizacion.objects.filter(
            usuario=self.request.user,
            estado='activa'
        ).prefetch_related('items__producto')

    def destroy(self, request, *args, **kwargs):
        cot = self.get_object()
        cot.estado = 'eliminada'
        cot.save()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='crear_desde_ticket')
    def crear_desde_ticket(self, request):
        venta_id = request.data.get('venta_id')
        try:
            venta = Venta.objects.prefetch_related('items__producto').get(
                id=venta_id, usuario=request.user, estado='pendiente'
            )
        except Venta.DoesNotExist:
            return Response({'error': 'Ticket no encontrado.'}, status=404)

        if not venta.items.exists():
            return Response({'error': 'El ticket no tiene artículos.'}, status=400)

        count = Cotizacion.objects.count()
        numero = f"COT-{str(count + 1).zfill(4)}"
        while Cotizacion.objects.filter(numero=numero).exists():
            count += 1
            numero = f"COT-{str(count + 1).zfill(4)}"

        cotizacion = Cotizacion.objects.create(usuario=request.user, numero=numero)

        for item in venta.items.all():
            nombre = item.producto_comun_nombre if item.es_producto_comun else (
                item.producto.nombre if item.producto else ''
            )
            CotizacionItem.objects.create(
                cotizacion=cotizacion,
                producto=item.producto,
                es_producto_comun=item.es_producto_comun,
                producto_comun_nombre=nombre,
                cantidad=item.cantidad,
                precio_unitario=item.precio_unitario,
                subtotal=item.subtotal,
            )

        cotizacion = Cotizacion.objects.prefetch_related('items__producto').get(id=cotizacion.id)
        return Response(CotizacionSerializer(cotizacion).data, status=201)

    @action(detail=True, methods=['post'], url_path='cargar_al_carrito')
    def cargar_al_carrito(self, request, pk=None):
        cotizacion = self.get_object()
        venta_id = request.data.get('venta_id')
        try:
            venta = Venta.objects.prefetch_related('items__producto').get(
                id=venta_id, usuario=request.user, estado='pendiente'
            )
        except Venta.DoesNotExist:
            return Response({'error': 'Ticket no encontrado.'}, status=404)

        advertencias = []
        for item in cotizacion.items.select_related('producto').all():
            if item.es_producto_comun:
                DetalleVenta.objects.create(
                    venta=venta,
                    producto=None,
                    es_producto_comun=True,
                    producto_comun_nombre=item.producto_comun_nombre,
                    cantidad=item.cantidad,
                    precio_unitario=item.precio_unitario,
                    precio_tipo='comun',
                )
            elif item.producto:
                producto = item.producto
                if producto.usa_inventario and producto.inventario_actual < item.cantidad:
                    advertencias.append(
                        f'{producto.nombre}: stock insuficiente ({producto.inventario_actual} disp.)'
                    )
                existing = DetalleVenta.objects.filter(
                    venta=venta, producto=producto, es_producto_comun=False
                ).first()
                if existing:
                    existing.cantidad += item.cantidad
                    existing.save()
                else:
                    DetalleVenta.objects.create(
                        venta=venta,
                        producto=producto,
                        cantidad=item.cantidad,
                        precio_unitario=item.precio_unitario,
                        precio_tipo='normal',
                    )

        cotizacion.estado = 'usada'
        cotizacion.save()

        venta.calcular_total()
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response({
            'venta': VentaSerializer(venta).data,
            'advertencias': advertencias,
        })