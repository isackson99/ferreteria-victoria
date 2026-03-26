from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from datetime import datetime, timedelta
from django.utils.timezone import make_aware, get_current_timezone
import pytz


class PermisoReportes(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated


class ResumenDiaView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Venta, PagoTicket

        fecha_str = request.query_params.get('fecha')
        if fecha_str:
            try:
                fecha = datetime.strptime(fecha_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Formato de fecha inválido. Usa YYYY-MM-DD.'}, status=400)
        else:
            tz = pytz.timezone('America/Santiago')
            fecha = datetime.now(tz).date()

        tz = pytz.timezone('America/Santiago')
        fecha = datetime.now(tz).date()
        inicio = tz.localize(datetime.combine(fecha, datetime.min.time()))
        fin = tz.localize(datetime.combine(fecha, datetime.max.time())) 
        ventas = Venta.objects.filter(estado='completada', completada__range=(inicio, fin))
        pagos = PagoTicket.objects.filter(ticket__venta__in=ventas)

        total_general = ventas.aggregate(t=Sum('total'))['t'] or 0
        total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_efectivo'))['t'] or 0
        total_tarjeta = pagos.filter(metodo__in=['tarjeta', 'mixto']).aggregate(t=Sum('monto_tarjeta'))['t'] or 0
        total_credito = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0
        total_mixto = pagos.filter(metodo='mixto').count()

        ventas_canceladas = Venta.objects.filter(
            estado='cancelada',
            creada__range=(inicio, fin)
        ).count()

        return Response({
            'fecha': fecha,
            'cantidad_ventas': ventas.count(),
            'total_general': total_general,
            'por_metodo': {
                'efectivo': total_efectivo,
                'tarjeta': total_tarjeta,
                'credito': total_credito,
                'mixto_cantidad': total_mixto,
            },
            'ventas_credito': ventas.filter(es_credito=True).count(),
            'ventas_canceladas': ventas_canceladas,
        })


class ResumenRangoView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Venta, PagoTicket
        from django.db.models.functions import TruncDate

        fecha_inicio_str = request.query_params.get('desde')
        fecha_fin_str = request.query_params.get('hasta')

        if not fecha_inicio_str or not fecha_fin_str:
            return Response({'error': 'Debes enviar los parámetros "desde" y "hasta" en formato YYYY-MM-DD.'}, status=400)

        try:
            fecha_inicio = datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
            fecha_fin = datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Formato de fecha inválido. Usa YYYY-MM-DD.'}, status=400)

        tz = pytz.timezone('America/Santiago')
        inicio = tz.localize(datetime.combine(fecha_inicio, datetime.min.time()))
        fin = tz.localize(datetime.combine(fecha_fin, datetime.max.time()))

        ventas = Venta.objects.filter(estado='completada', completada__range=(inicio, fin))
        pagos = PagoTicket.objects.filter(ticket__venta__in=ventas)

        total_general = ventas.aggregate(t=Sum('total'))['t'] or 0
        total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_efectivo'))['t'] or 0
        total_tarjeta = pagos.filter(metodo__in=['tarjeta', 'mixto']).aggregate(t=Sum('monto_tarjeta'))['t'] or 0
        total_credito = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0

        resumen_diario = ventas.annotate(
            dia=TruncDate('completada')
        ).values('dia').annotate(
            cantidad=Count('id'),
            total=Sum('total')
        ).order_by('dia')

        return Response({
            'desde': fecha_inicio,
            'hasta': fecha_fin,
            'cantidad_ventas': ventas.count(),
            'total_general': total_general,
            'por_metodo': {
                'efectivo': total_efectivo,
                'tarjeta': total_tarjeta,
                'credito': total_credito,
            },
            'resumen_diario': list(resumen_diario),
        })


class ProductosMasVendidosView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import DetalleVenta

        fecha_inicio_str = request.query_params.get('desde')
        fecha_fin_str = request.query_params.get('hasta')
        limite = int(request.query_params.get('limite', 10))

        filtros = Q(venta__estado='completada')

        if fecha_inicio_str:
            try:
                fi = datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                filtros &= Q(venta__completada__gte=make_aware(datetime.combine(fi, datetime.min.time()), tz))
            except ValueError:
                pass
        if fecha_fin_str:
            try:
                ff = datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                filtros &= Q(venta__completada__lte=make_aware(datetime.combine(ff, datetime.max.time()), tz))
            except ValueError:
                pass

        productos = DetalleVenta.objects.filter(filtros).values(
            'producto__id',
            'producto__nombre',
            'producto__codigo',
        ).annotate(
            total_vendido=Sum('cantidad'),
            total_ingresos=Sum('subtotal'),
            veces_vendido=Count('id'),
        ).order_by('-total_vendido')[:limite]

        return Response(list(productos))


class StockCriticoView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from productos.models import Producto

        agotados = Producto.objects.filter(
            activo=True,
            inventario_actual__lte=0
        ).exclude(tipo='kit').values('id', 'nombre', 'codigo', 'inventario_actual', 'inventario_minimo')

        stock_bajo = Producto.objects.filter(
            activo=True,
            inventario_actual__gt=0,
            inventario_actual__lte=F('inventario_minimo')
        ).exclude(tipo='kit').values('id', 'nombre', 'codigo', 'inventario_actual', 'inventario_minimo')

        return Response({
            'agotados': list(agotados),
            'stock_bajo': list(stock_bajo),
        })


class ClientesDeudaView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from creditos.models import CuentaCredito

        cuentas = CuentaCredito.objects.filter(
            saldo_usado__gt=0
        ).select_related('cliente').order_by('-saldo_usado')

        resultado = []
        for cuenta in cuentas:
            resultado.append({
                'cliente_id': cuenta.cliente.id,
                'cliente_nombre': cuenta.cliente.nombre,
                'saldo_usado': cuenta.saldo_usado,
                'saldo_disponible': cuenta.saldo_disponible,
                'credito_maximo': cuenta.cliente.credito_maximo,
                'credito_ilimitado': cuenta.cliente.credito_ilimitado,
                'fecha_vencimiento': cuenta.cliente.fecha_vencimiento,
                'porcentaje_uso': round(cuenta.porcentaje_uso, 1),
            })

        return Response(resultado)


class MovimientosCreditoDiaView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from creditos.models import MovimientoCredito

        fecha_str = request.query_params.get('fecha')
        if fecha_str:
            try:
                fecha = datetime.strptime(fecha_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Formato de fecha inválido. Usa YYYY-MM-DD.'}, status=400)
        else:
            tz = pytz.timezone('America/Santiago')
            fecha = datetime.now(tz).date()

        tz = pytz.timezone('America/Santiago')
        inicio = make_aware(datetime.combine(fecha, datetime.min.time()), tz)
        fin = make_aware(datetime.combine(fecha, datetime.max.time()), tz)

        movimientos = MovimientoCredito.objects.filter(
            fecha__range=(inicio, fin)
        ).select_related('cuenta__cliente', 'usuario', 'ticket').order_by('-fecha')

        resultado = []
        for m in movimientos:
            resultado.append({
                'id': m.id,
                'tipo': m.tipo,
                'monto': m.monto,
                'cliente': m.cuenta.cliente.nombre,
                'usuario': m.usuario.username if m.usuario else None,
                'metodo_pago': m.metodo_pago,
                'ticket': m.ticket.numero if m.ticket else None,
                'fecha': m.fecha,
                'notas': m.notas,
            })

        cargos = movimientos.filter(tipo='cargo').aggregate(t=Sum('monto'))['t'] or 0
        abonos = movimientos.filter(tipo='abono').aggregate(t=Sum('monto'))['t'] or 0

        return Response({
            'fecha': fecha,
            'total_cargos': cargos,
            'total_abonos': abonos,
            'movimientos': resultado,
        })


class VentasPorUsuarioView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Venta

        fecha_inicio_str = request.query_params.get('desde')
        fecha_fin_str = request.query_params.get('hasta')

        filtros = Q(estado='completada')

        if fecha_inicio_str:
            try:
                fi = datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                filtros &= Q(completada__gte=make_aware(datetime.combine(fi, datetime.min.time()), tz))
            except ValueError:
                pass
        if fecha_fin_str:
            try:
                ff = datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                filtros &= Q(completada__lte=make_aware(datetime.combine(ff, datetime.max.time()), tz))
            except ValueError:
                pass

        por_usuario = Venta.objects.filter(filtros).values(
            'usuario__id',
            'usuario__username',
            'usuario__first_name',
            'usuario__last_name',
        ).annotate(
            cantidad_ventas=Count('id'),
            total_vendido=Sum('total'),
        ).order_by('-total_vendido')

        return Response(list(por_usuario))


class HistorialTicketsView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Ticket

        fecha_inicio_str = request.query_params.get('desde')
        fecha_fin_str = request.query_params.get('hasta')
        usuario_id = request.query_params.get('usuario_id')

        filtros = Q(venta__estado='completada')

        if fecha_inicio_str:
            try:
                fi = datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                filtros &= Q(generado__gte=make_aware(datetime.combine(fi, datetime.min.time()), tz))
            except ValueError:
                pass
        if fecha_fin_str:
            try:
                ff = datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                filtros &= Q(generado__lte=make_aware(datetime.combine(ff, datetime.max.time()), tz))
            except ValueError:
                pass
        if usuario_id:
            filtros &= Q(venta__usuario__id=usuario_id)

        tickets = Ticket.objects.filter(filtros).select_related(
            'venta__usuario', 'venta__cliente_credito'
        ).prefetch_related('pagos').order_by('-generado')

        resultado = []
        for ticket in tickets:
            resultado.append({
                'id': ticket.id,
                'numero': ticket.numero,
                'generado': ticket.generado,
                'total': ticket.venta.total,
                'usuario': ticket.venta.usuario.username if ticket.venta.usuario else None,
                'cliente_credito': ticket.venta.cliente_credito.nombre if ticket.venta.cliente_credito else None,
                'es_credito': ticket.venta.es_credito,
                'pagos': [
                    {
                        'metodo': p.metodo,
                        'monto_total': p.monto_total,
                        'monto_efectivo': p.monto_efectivo,
                        'monto_tarjeta': p.monto_tarjeta,
                        'vuelto': p.vuelto,
                    }
                    for p in ticket.pagos.all()
                ],
            })

        return Response(resultado)


class DetalleTicketView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request, numero):
        from ventas.models import Ticket

        try:
            ticket = Ticket.objects.select_related(
                'venta__usuario',
                'venta__cliente_credito',
                'venta__cliente_factura',
            ).prefetch_related(
                'venta__items__producto',
                'pagos',
            ).get(numero=numero)
        except Ticket.DoesNotExist:
            return Response({'error': 'Ticket no encontrado.'}, status=404)

        venta = ticket.venta
        return Response({
            'ticket': {
                'numero': ticket.numero,
                'generado': ticket.generado,
            },
            'venta': {
                'id': venta.id,
                'usuario': venta.usuario.username if venta.usuario else None,
                'es_credito': venta.es_credito,
                'cliente_credito': venta.cliente_credito.nombre if venta.cliente_credito else None,
                'cliente_factura': {
                    'nombre': venta.cliente_factura.nombre,
                    'rut': venta.cliente_factura.rut,
                } if venta.cliente_factura else None,
                'total': venta.total,
                'creada': venta.creada,
                'completada': venta.completada,
            },
            'productos': [
                {
                    'nombre': item.producto.nombre,
                    'codigo': item.producto.codigo,
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

class HistorialMovimientosView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from productos.models import MovimientoInventario

        fecha_str = request.query_params.get('fecha')
        producto_id = request.query_params.get('producto_id')
        tipo = request.query_params.get('tipo')
        usuario_id = request.query_params.get('usuario_id')
        search = request.query_params.get('search', '').strip()

        filtros = Q()

        if fecha_str:
            try:
                fecha = datetime.strptime(fecha_str, '%Y-%m-%d').date()
                tz = pytz.timezone('America/Santiago')
                inicio = tz.localize(datetime.combine(fecha, datetime.min.time()))
                fin = tz.localize(datetime.combine(fecha, datetime.max.time()))
                filtros &= Q(fecha__range=(inicio, fin))
            except ValueError:
                return Response({'error': 'Formato de fecha inválido. Usa YYYY-MM-DD.'}, status=400)

        if producto_id:
            filtros &= Q(producto__id=producto_id)
        if tipo:
            filtros &= Q(tipo=tipo)
        if usuario_id:
            filtros &= Q(usuario__id=usuario_id)
        if search:
            filtros &= Q(producto__nombre__icontains=search) | Q(producto__codigo__icontains=search)

        movimientos = MovimientoInventario.objects.filter(filtros).select_related(
            'producto', 'usuario', 'referencia_venta'
        ).order_by('-fecha')

        resultado = []
        for m in movimientos:
            resultado.append({
                'id': m.id,
                'tipo': m.tipo,
                'tipo_display': m.get_tipo_display(),
                'producto_id': m.producto.id,
                'producto_nombre': m.producto.nombre,
                'producto_codigo': m.producto.codigo,
                'cantidad': m.cantidad,
                'stock_antes': m.stock_antes,
                'stock_despues': m.stock_despues,
                'motivo': m.motivo,
                'usuario': m.usuario.username if m.usuario else None,
                'referencia_venta': m.referencia_venta.id if m.referencia_venta else None,
                'fecha': m.fecha,
            })

        return Response(resultado)


class KardexProductoView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request, producto_id):
        from productos.models import MovimientoInventario, Producto

        try:
            producto = Producto.objects.get(id=producto_id)
        except Producto.DoesNotExist:
            return Response({'error': 'Producto no encontrado.'}, status=404)

        desde_str = request.query_params.get('desde')
        hasta_str = request.query_params.get('hasta')

        filtros = Q(producto=producto)
        tz = pytz.timezone('America/Santiago')

        if desde_str:
            try:
                fi = datetime.strptime(desde_str, '%Y-%m-%d').date()
                filtros &= Q(fecha__gte=tz.localize(datetime.combine(fi, datetime.min.time())))
            except ValueError:
                pass
        if hasta_str:
            try:
                ff = datetime.strptime(hasta_str, '%Y-%m-%d').date()
                filtros &= Q(fecha__lte=tz.localize(datetime.combine(ff, datetime.max.time())))
            except ValueError:
                pass

        movimientos = MovimientoInventario.objects.filter(filtros).select_related(
            'usuario', 'referencia_venta'
        ).order_by('fecha')

        resultado = []
        for m in movimientos:
            resultado.append({
                'id': m.id,
                'fecha': m.fecha,
                'tipo': m.tipo,
                'tipo_display': m.get_tipo_display(),
                'cantidad': m.cantidad,
                'stock_antes': m.stock_antes,
                'stock_despues': m.stock_despues,
                'motivo': m.motivo,
                'usuario': m.usuario.username if m.usuario else None,
                'referencia_venta': m.referencia_venta.id if m.referencia_venta else None,
            })

        return Response({
            'producto': {
                'id': producto.id,
                'nombre': producto.nombre,
                'codigo': producto.codigo,
                'inventario_actual': producto.inventario_actual,
            },
            'movimientos': resultado,
        })
        
class CorteCajaView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Venta, PagoTicket, MovimientoCaja
        from creditos.models import MovimientoCredito
        from django.db.models import Sum, Count

        fecha_str = request.query_params.get('fecha')
        tz = pytz.timezone('America/Santiago')

        if fecha_str:
            try:
                fecha = datetime.strptime(fecha_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Formato inválido.'}, status=400)
        else:
            fecha = datetime.now(tz).date()

        inicio = tz.localize(datetime.combine(fecha, datetime.min.time()))
        fin = tz.localize(datetime.combine(fecha, datetime.max.time()))

        ventas = Venta.objects.filter(estado='completada', completada__range=(inicio, fin))
        pagos = PagoTicket.objects.filter(ticket__venta__in=ventas)

        total_ventas = ventas.aggregate(t=Sum('total'))['t'] or 0
        cantidad_ventas = ventas.count()
        total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_efectivo'))['t'] or 0
        total_tarjeta = pagos.filter(metodo__in=['tarjeta', 'mixto']).aggregate(t=Sum('monto_tarjeta'))['t'] or 0
        total_credito = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0
        devoluciones = Venta.objects.filter(estado='cancelada', completada__range=(inicio, fin)).count()

        # Entradas y salidas de caja
        movimientos_caja = MovimientoCaja.objects.filter(fecha__range=(inicio, fin))
        total_entradas = movimientos_caja.filter(tipo='entrada').aggregate(t=Sum('monto'))['t'] or 0
        total_salidas = movimientos_caja.filter(tipo='salida').aggregate(t=Sum('monto'))['t'] or 0

        # Abonos de crédito del día
        abonos = MovimientoCredito.objects.filter(
            tipo='abono', fecha__range=(inicio, fin)
        ).aggregate(t=Sum('monto'))['t'] or 0

        # Ventas por categoría
        from django.db.models import F
        from ventas.models import DetalleVenta
        por_categoria = DetalleVenta.objects.filter(
            venta__in=ventas,
            es_producto_comun=False,
        ).values(
            'producto__categoria__nombre'
        ).annotate(
            total=Sum('subtotal'),
            cantidad=Count('id'),
        ).order_by('-total')

        # Ganancia del día
        ganancia = DetalleVenta.objects.filter(
            venta__in=ventas,
            es_producto_comun=False,
        ).annotate(
            ganancia_item=Sum(
                (F('precio_unitario') - F('producto__precio_costo')) * F('cantidad')
            )
        ).aggregate(t=Sum('ganancia_item'))['t'] or 0

        return Response({
            'fecha': fecha,
            'ventas': {
                'cantidad': cantidad_ventas,
                'total': total_ventas,
                'devoluciones': devoluciones,
                'venta_promedio': round(total_ventas / cantidad_ventas, 0) if cantidad_ventas else 0,
            },
            'por_metodo': {
                'efectivo': total_efectivo,
                'tarjeta': total_tarjeta,
                'credito': total_credito,
            },
            'caja': {
                'entradas': total_entradas,
                'salidas': total_salidas,
                'abonos_credito': abonos,
                'total_caja': float(total_efectivo) + float(total_entradas) - float(total_salidas),
            },
            'ganancia': ganancia,
            'por_categoria': list(por_categoria),
        })

class ResumenVentasView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Venta, PagoTicket, DetalleVenta
        from django.db.models import Sum, Count, Avg, F
        from django.db.models.functions import TruncDate, TruncWeek

        periodo = request.query_params.get('periodo', 'semana')
        tz = pytz.timezone('America/Santiago')
        hoy = datetime.now(tz).date()

        if periodo == 'semana':
            desde = hoy - timedelta(days=hoy.weekday())
            hasta = hoy
        elif periodo == 'mes':
            desde = hoy.replace(day=1)
            hasta = hoy
        elif periodo == 'mes_anterior':
            primer_dia_mes = hoy.replace(day=1)
            ultimo_mes = primer_dia_mes - timedelta(days=1)
            desde = ultimo_mes.replace(day=1)
            hasta = ultimo_mes
        elif periodo == 'año':
            desde = hoy.replace(month=1, day=1)
            hasta = hoy
        else:
            desde_str = request.query_params.get('desde')
            hasta_str = request.query_params.get('hasta')
            if not desde_str or not hasta_str:
                return Response({'error': 'Para periodo personalizado envía desde y hasta.'}, status=400)
            try:
                desde = datetime.strptime(desde_str, '%Y-%m-%d').date()
                hasta = datetime.strptime(hasta_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Formato de fecha inválido.'}, status=400)

        inicio = tz.localize(datetime.combine(desde, datetime.min.time()))
        fin = tz.localize(datetime.combine(hasta, datetime.max.time()))

        ventas = Venta.objects.filter(estado='completada', completada__range=(inicio, fin))
        pagos = PagoTicket.objects.filter(ticket__venta__in=ventas)
        items = DetalleVenta.objects.filter(venta__in=ventas, es_producto_comun=False)

        # User filtering
        usuario_id_param = request.query_params.get('usuario_id')
        is_admin = request.user.is_superuser or (hasattr(request.user, 'rol') and request.user.rol and request.user.rol.nombre == 'Admin')
        if not is_admin:
            ventas = ventas.filter(usuario=request.user)
            pagos = PagoTicket.objects.filter(ticket__venta__in=ventas)
            items = DetalleVenta.objects.filter(venta__in=ventas, es_producto_comun=False)
        elif usuario_id_param:
            ventas = ventas.filter(usuario__id=usuario_id_param)
            pagos = PagoTicket.objects.filter(ticket__venta__in=ventas)
            items = DetalleVenta.objects.filter(venta__in=ventas, es_producto_comun=False)

        total_ventas = ventas.aggregate(t=Sum('total'))['t'] or 0
        cantidad_ventas = ventas.count()
        total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_efectivo'))['t'] or 0
        total_tarjeta = pagos.filter(metodo__in=['tarjeta', 'mixto']).aggregate(t=Sum('monto_tarjeta'))['t'] or 0
        total_credito = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0
        total_mixto = pagos.filter(metodo='mixto').aggregate(t=Sum('monto_total'))['t'] or 0

        ganancia = items.annotate(
            g=( F('precio_unitario') - F('producto__precio_costo')) * F('cantidad')
        ).aggregate(t=Sum('g'))['t'] or 0

        margen = round(float(ganancia) / float(total_ventas) * 100, 2) if total_ventas else 0

        # Ventas por día
        por_dia = ventas.annotate(
            dia=TruncDate('completada')
        ).values('dia').annotate(
            total=Sum('total'),
            cantidad=Count('id'),
        ).order_by('dia')

        # Ganancia por día
        from django.db.models.functions import TruncDate as TD2
        ganancia_dia_qs = items.annotate(
            gdia=TD2('venta__completada')
        ).values('gdia').annotate(
            ganancia=Sum((F('precio_unitario') - F('producto__precio_costo')) * F('cantidad'))
        ).order_by('gdia')
        ganancia_dia_map = {str(row['gdia']): float(row['ganancia'] or 0) for row in ganancia_dia_qs}

        por_dia_lista = []
        for row in por_dia:
            dia_str = str(row['dia'])
            por_dia_lista.append({
                'dia': row['dia'],
                'total': float(row['total'] or 0),
                'cantidad': row['cantidad'],
                'ganancia': ganancia_dia_map.get(dia_str, 0),
            })

        # Métodos de pago por día
        from django.db.models.functions import TruncDate as TD3
        por_metodo_dia_qs = pagos.annotate(
            pdia=TD3('fecha')
        ).values('pdia', 'metodo').annotate(
            total=Sum('monto_total')
        ).order_by('pdia', 'metodo')

        por_metodo_dia = {}
        for row in por_metodo_dia_qs:
            dia_str = str(row['pdia'])
            if dia_str not in por_metodo_dia:
                por_metodo_dia[dia_str] = {'efectivo': 0, 'tarjeta': 0, 'mixto': 0, 'credito': 0}
            metodo = row['metodo']
            if metodo in por_metodo_dia[dia_str]:
                por_metodo_dia[dia_str][metodo] = float(row['total'] or 0)

        # Ventas por categoría
        por_categoria = items.values(
            'producto__categoria__nombre'
        ).annotate(
            total=Sum('subtotal'),
            ganancia=Sum((F('precio_unitario') - F('producto__precio_costo')) * F('cantidad')),
        ).order_by('-total')

        return Response({
            'periodo': periodo,
            'desde': desde,
            'hasta': hasta,
            'es_admin': is_admin,
            'resumen': {
                'total_ventas': total_ventas,
                'cantidad_ventas': cantidad_ventas,
                'venta_promedio': round(float(total_ventas) / cantidad_ventas, 0) if cantidad_ventas else 0,
                'ganancia': ganancia,
                'margen_utilidad': margen,
            },
            'por_metodo': {
                'efectivo': total_efectivo,
                'tarjeta': total_tarjeta,
                'credito': total_credito,
                'mixto': total_mixto,
            },
            'por_dia': por_dia_lista,
            'por_categoria': list(por_categoria),
            'por_metodo_dia': por_metodo_dia,
        })


class UsuariosReportesView(APIView):
    permission_classes = [PermisoReportes]

    def get(self, request):
        from ventas.models import Venta
        usuario = request.user
        is_admin = usuario.is_superuser or (hasattr(usuario, 'rol') and usuario.rol and usuario.rol.nombre == 'Admin')
        if not is_admin:
            return Response([])
        usuarios = Venta.objects.filter(
            estado='completada', usuario__isnull=False
        ).values('usuario__id', 'usuario__username').distinct().order_by('usuario__username')
        return Response([{'id': u['usuario__id'], 'username': u['usuario__username']} for u in usuarios])