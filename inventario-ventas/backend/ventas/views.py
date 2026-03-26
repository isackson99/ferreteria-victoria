from datetime import datetime

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from .models import Venta, DetalleVenta, Ticket, PagoTicket, MovimientoCaja
from .serializers import VentaSerializer, AgregarItemSerializer, ConfirmarVentaSerializer, TicketSerializer
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
        if user.is_superuser or (user.rol and user.rol.nombre == 'Admin'):
            return Venta.objects.all().select_related(
                'usuario', 'cliente_credito', 'cliente_factura'
            ).prefetch_related('items__producto')
        return Venta.objects.filter(
            usuario=user
        ).select_related(
            'usuario', 'cliente_credito', 'cliente_factura'
        ).prefetch_related('items__producto')

    def perform_create(self, serializer):
        serializer.save(usuario=self.request.user)

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
        venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
        return Response(VentaSerializer(venta).data)

    @action(detail=True, methods=['delete'], url_path='quitar_item/(?P<item_id>[^/.]+)')
    def quitar_item(self, request, pk=None, item_id=None):
        venta = self.get_object()
        try:
            item = DetalleVenta.objects.get(id=item_id, venta=venta)
            item.delete()
            venta.calcular_total()
            venta = Venta.objects.prefetch_related('items__producto').get(id=venta.id)
            return Response(VentaSerializer(venta).data)
        except DetalleVenta.DoesNotExist:
            return Response({'error': 'Item no encontrado.'}, status=404)

    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        venta = self.get_object()
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

            from notificaciones.models import Notificacion, TipoNotificacion, ConfiguracionNotificacion
            try:
                tipo = TipoNotificacion.objects.get(codigo='venta_completada')
                roles_activos = ConfiguracionNotificacion.objects.filter(
                    tipo=tipo, activa=True
                ).select_related('rol')
                for config in roles_activos:
                    Notificacion.objects.create(
                        tipo=tipo,
                        titulo=f'Venta completada — #{venta.id}',
                        mensaje=f'Venta #{venta.id} por ${venta.total:,.0f} completada por {request.user.username}.',
                        destinatario_rol=config.rol,
                        referencia_id=ticket.id,
                        referencia_tipo='ticket',
                    )
            except TipoNotificacion.DoesNotExist:
                pass

            if data['metodo'] == 'credito':
                try:
                    tipo_credito = TipoNotificacion.objects.get(codigo='venta_credito')
                    roles_activos = ConfiguracionNotificacion.objects.filter(
                        tipo=tipo_credito, activa=True
                    ).select_related('rol')
                    for config in roles_activos:
                        Notificacion.objects.create(
                            tipo=tipo_credito,
                            titulo=f'Venta a crédito — {cliente.nombre}',
                            mensaje=f'Se registró una venta a crédito por ${venta.total:,.0f} a {cliente.nombre}.',
                            destinatario_rol=config.rol,
                            referencia_id=ticket.id,
                            referencia_tipo='ticket',
                        )
                except TipoNotificacion.DoesNotExist:
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
        if float(cantidad) <= 0:
            return Response({'error': 'La cantidad debe ser mayor a 0.'}, status=400)

        DetalleVenta.objects.create(
            venta=venta,
            producto=None,
            es_producto_comun=True,
            producto_comun_nombre=nombre,
            cantidad=cantidad,
            precio_unitario=precio,
            precio_tipo='comun',
        )

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
        return Response(VentaSerializer(venta).data, status=201)

    @action(detail=True, methods=['post'])
    def devolver(self, request, pk=None):
        from notificaciones.models import Notificacion, TipoNotificacion, ConfiguracionNotificacion
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
                tipo = TipoNotificacion.objects.get(codigo='venta_cancelada')
                roles_activos = ConfiguracionNotificacion.objects.filter(
                    tipo=tipo, activa=True
                ).select_related('rol')
                for config in roles_activos:
                    Notificacion.objects.create(
                        tipo=tipo,
                        titulo=f'Devolución — Venta #{venta.id}',
                        mensaje=f'Se devolvió la venta #{venta.id} por ${venta.total:,.0f}. Inventario restaurado.',
                        destinatario_rol=config.rol,
                        referencia_id=venta.id,
                        referencia_tipo='venta',
                    )
            except TipoNotificacion.DoesNotExist:
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

        if item.es_producto_comun:
            return Response({'error': 'No se puede cambiar la cantidad de artículos comunes desde aquí.'}, status=400)

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

        item.cantidad = nueva_cantidad
        item.save()
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

        return Response({
            'id': m.id,
            'tipo': m.tipo,
            'monto': m.monto,
            'motivo': m.motivo,
            'usuario': request.user.username,
            'fecha': m.fecha,
        }, status=201)