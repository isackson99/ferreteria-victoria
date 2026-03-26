from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status


class ResumenCorteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from ventas.models import Venta, Ticket, PagoTicket, MovimientoCaja, CorteCaja
        from creditos.models import MovimientoCredito

        usuario = request.user

        # Find last corte for this user to determine shift start
        ultimo_corte = CorteCaja.objects.filter(usuario=usuario).order_by('-fecha_corte').first()
        desde = ultimo_corte.fecha_corte if ultimo_corte else None

        # Completed sales for this shift
        ventas_qs = Venta.objects.filter(usuario=usuario, estado='completada')
        if desde:
            ventas_qs = ventas_qs.filter(completada__gt=desde)

        tickets = Ticket.objects.filter(venta__in=ventas_qs)
        pagos = PagoTicket.objects.filter(ticket__in=tickets)

        # Totals by payment method (monto_total per method)
        total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_total'))['t'] or 0
        total_tarjeta  = pagos.filter(metodo='tarjeta').aggregate(t=Sum('monto_total'))['t'] or 0
        total_credito  = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0
        total_mixto    = pagos.filter(metodo='mixto').aggregate(t=Sum('monto_total'))['t'] or 0

        # Physical cash in register (efectivo + cash part of mixto)
        efectivo_ventas = float(pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_efectivo'))['t'] or 0)
        efectivo_mixto  = float(pagos.filter(metodo='mixto').aggregate(t=Sum('monto_efectivo'))['t'] or 0)
        efectivo_fisico = efectivo_ventas + efectivo_mixto

        # Cash movements
        mov_qs = MovimientoCaja.objects.filter(usuario=usuario)
        if desde:
            mov_qs = mov_qs.filter(fecha__gt=desde)
        total_entradas = mov_qs.filter(tipo='entrada').aggregate(t=Sum('monto'))['t'] or 0
        total_salidas  = mov_qs.filter(tipo='salida').aggregate(t=Sum('monto'))['t'] or 0

        # Detail of movements
        entradas_detalle = list(mov_qs.filter(tipo='entrada').values('id', 'motivo', 'monto', 'fecha').order_by('fecha'))
        salidas_detalle  = list(mov_qs.filter(tipo='salida').values('id', 'motivo', 'monto', 'fecha').order_by('fecha'))

        # Credit payments received
        abonos_qs = MovimientoCredito.objects.filter(tipo='abono', usuario=usuario)
        if desde:
            abonos_qs = abonos_qs.filter(fecha__gt=desde)
        total_abonos = abonos_qs.aggregate(t=Sum('monto'))['t'] or 0

        abonos_detalle = []
        for ab in abonos_qs.select_related('cuenta__cliente').order_by('fecha'):
            abonos_detalle.append({
                'id': ab.id,
                'cliente': ab.cuenta.cliente.nombre,
                'monto': ab.monto,
                'metodo_pago': ab.metodo_pago,
                'fecha': ab.fecha,
            })

        # Cancellations/returns
        dev_qs = Venta.objects.filter(usuario=usuario, estado='cancelada')
        if desde:
            dev_qs = dev_qs.filter(creada__gt=desde)
        total_devoluciones = dev_qs.aggregate(t=Sum('total'))['t'] or 0

        # Sales by department
        from ventas.models import DetalleVenta
        items_turno = DetalleVenta.objects.filter(venta__in=ventas_qs).select_related('producto__categoria')
        ventas_dept = {}
        for item in items_turno:
            if item.producto and item.producto.categoria:
                dept = item.producto.categoria.nombre
            else:
                dept = 'Sin Departamento'
            ventas_dept[dept] = ventas_dept.get(dept, 0) + float(item.subtotal)

        # Top clients
        clientes_top = list(
            ventas_qs.filter(es_credito=True)
            .values('cliente_credito__nombre')
            .annotate(total=Sum('total'), compras=Count('id'))
            .order_by('-total')[:5]
        )

        total_ventas = float(total_efectivo) + float(total_tarjeta) + float(total_credito) + float(total_mixto)
        efectivo_en_caja = efectivo_fisico + float(total_entradas) - float(total_salidas)

        return Response({
            'desde': desde,
            'hasta': timezone.now(),
            'usuario': usuario.username,
            'cantidad_tickets': tickets.count(),
            'total_efectivo': total_efectivo,
            'total_tarjeta': total_tarjeta,
            'total_credito': total_credito,
            'total_mixto': total_mixto,
            'total_ventas': total_ventas,
            'total_entradas': total_entradas,
            'total_salidas': total_salidas,
            'total_abonos_credito': total_abonos,
            'total_devoluciones': total_devoluciones,
            'ventas_por_departamento': ventas_dept,
            'clientes_top': clientes_top,
            'efectivo_en_caja': efectivo_en_caja,
            'entradas_detalle': entradas_detalle,
            'salidas_detalle': salidas_detalle,
            'abonos_detalle': abonos_detalle,
        })


class ConfirmarCorteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from ventas.models import Venta, Ticket, PagoTicket, MovimientoCaja, CorteCaja
        from creditos.models import MovimientoCredito
        from django.db.models import Sum, Count

        usuario = request.user
        notas = request.data.get('notas', '')

        ultimo_corte = CorteCaja.objects.filter(usuario=usuario).order_by('-fecha_corte').first()
        desde = ultimo_corte.fecha_corte if ultimo_corte else None

        ventas_qs = Venta.objects.filter(usuario=usuario, estado='completada')
        if desde:
            ventas_qs = ventas_qs.filter(completada__gt=desde)

        tickets = Ticket.objects.filter(venta__in=ventas_qs)
        pagos = PagoTicket.objects.filter(ticket__in=tickets)

        total_efectivo = pagos.filter(metodo='efectivo').aggregate(t=Sum('monto_total'))['t'] or 0
        total_tarjeta  = pagos.filter(metodo='tarjeta').aggregate(t=Sum('monto_total'))['t'] or 0
        total_credito  = pagos.filter(metodo='credito').aggregate(t=Sum('monto_total'))['t'] or 0
        total_mixto    = pagos.filter(metodo='mixto').aggregate(t=Sum('monto_total'))['t'] or 0

        mov_qs = MovimientoCaja.objects.filter(usuario=usuario)
        if desde:
            mov_qs = mov_qs.filter(fecha__gt=desde)
        total_entradas = mov_qs.filter(tipo='entrada').aggregate(t=Sum('monto'))['t'] or 0
        total_salidas  = mov_qs.filter(tipo='salida').aggregate(t=Sum('monto'))['t'] or 0

        abonos_qs = MovimientoCredito.objects.filter(tipo='abono', usuario=usuario)
        if desde:
            abonos_qs = abonos_qs.filter(fecha__gt=desde)
        total_abonos = abonos_qs.aggregate(t=Sum('monto'))['t'] or 0

        dev_qs = Venta.objects.filter(usuario=usuario, estado='cancelada')
        if desde:
            dev_qs = dev_qs.filter(creada__gt=desde)
        total_devoluciones = dev_qs.aggregate(t=Sum('total'))['t'] or 0

        total_ventas = float(total_efectivo) + float(total_tarjeta) + float(total_credito) + float(total_mixto)

        corte = CorteCaja.objects.create(
            usuario=usuario,
            fecha_inicio=desde,
            total_efectivo=total_efectivo,
            total_tarjeta=total_tarjeta,
            total_credito=total_credito,
            total_mixto=total_mixto,
            total_ventas=total_ventas,
            cantidad_tickets=tickets.count(),
            total_entradas=total_entradas,
            total_salidas=total_salidas,
            total_abonos_credito=total_abonos,
            total_devoluciones=total_devoluciones,
            notas=notas,
        )

        return Response({'mensaje': 'Corte realizado', 'corte_id': corte.id}, status=status.HTTP_201_CREATED)


class HistorialCortesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from ventas.models import CorteCaja
        usuario = request.user
        # Superusers/admins see all, others see only their own
        if usuario.is_superuser or (hasattr(usuario, 'rol') and usuario.rol and usuario.rol.nombre == 'Admin'):
            cortes = CorteCaja.objects.all().select_related('usuario')
        else:
            cortes = CorteCaja.objects.filter(usuario=usuario).select_related('usuario')

        resultado = []
        for c in cortes:
            resultado.append({
                'id': c.id,
                'usuario': c.usuario.username,
                'fecha_corte': c.fecha_corte,
                'fecha_inicio': c.fecha_inicio,
                'cantidad_tickets': c.cantidad_tickets,
                'total_ventas': c.total_ventas,
                'total_efectivo': c.total_efectivo,
                'total_tarjeta': c.total_tarjeta,
                'total_credito': c.total_credito,
                'total_mixto': c.total_mixto,
                'total_entradas': c.total_entradas,
                'total_salidas': c.total_salidas,
                'total_abonos_credito': c.total_abonos_credito,
                'total_devoluciones': c.total_devoluciones,
                'efectivo_en_caja': float(c.total_efectivo) + float(c.total_entradas) - float(c.total_salidas),
                'notas': c.notas,
            })
        return Response(resultado)
