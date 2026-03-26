import { Component, Input, Output, EventEmitter, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VentasService, Venta, DetalleVenta, Producto } from '../../../core/services/ventas';
import { ImpresionService, DatosTicket } from '../../../core/services/impresion';
import { CreditosService, ClienteCredito } from '../../../core/services/creditos';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ticket-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './ticket-panel.html',
  styleUrl: './ticket-panel.scss'
})
export class TicketPanelComponent implements OnInit, OnDestroy {
  @Input() totalTickets = 1;
  @Input() productoCache = new Map<number, Producto>();
  @Output() ticketActualizado = new EventEmitter<Venta>();
  @Output() ticketCompletado = new EventEmitter<number>();
  @Output() accionRealizada = new EventEmitter<void>();
  @Output() sugerirMayoreo = new EventEmitter<{ item: DetalleVenta; ventaId: number }>();

  ticket: Venta | null = null;
  items = signal<DetalleVenta[]>([]);
  total = signal(0);

  itemSeleccionadoId = signal<number | null>(null);
  itemConfirmandoEliminacion = signal<number | null>(null);

  // Cobro modal
  mostrarCobro = signal(false);

  // Dialog reimprimir (cliente factura)
  dialogReimprimir = signal(false);
  private datosReimprimir = signal<DatosTicket | null>(null);
  metodoPago = signal<'efectivo' | 'tarjeta' | 'mixto' | 'credito'>('efectivo');
  montoRecibido = signal(0);
  montoTarjeta = signal(0);
  cargando = signal(false);

  // Crédito: selector de cliente
  clientesCredito = signal<ClienteCredito[]>([]);
  clienteCreditoSel = signal<ClienteCredito | null>(null);
  busquedaCredito = signal('');
  cargandoClientes = signal(false);
  clientesCreditoFiltrados = computed(() => {
    const q = this.busquedaCredito().toLowerCase().trim();
    if (!q) return this.clientesCredito();
    return this.clientesCredito().filter(c =>
      c.nombre.toLowerCase().includes(q) || String(c.id).includes(q)
    );
  });

  private sub!: Subscription;

  constructor(
    private ventasService: VentasService,
    private impresionService: ImpresionService,
    private snackBar: MatSnackBar,
    private creditosService: CreditosService,
  ) {}

  ngOnInit(): void {
    this.sub = this.ventasService.ticketActivo$.subscribe(ticket => {
      if (!ticket) return;
      const cambioTicket = this.ticket?.id !== ticket.id;
      this.ticket = ticket;
      this.items.set(ticket.items.map(i => ({ ...i })));
      if (ticket.items.length > 0) {
        console.log('[ticket-panel] primer item:', JSON.stringify(ticket.items[0]));
      }
      this.total.set(Number(ticket.total));
      if (cambioTicket) {
        this.mostrarCobro.set(false);
        this.montoRecibido.set(0);
        this.montoTarjeta.set(0);
        this.itemSeleccionadoId.set(null);
        this.itemConfirmandoEliminacion.set(null);
        this.clienteCreditoSel.set(null);
        this.busquedaCredito.set('');
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ---- Selección y borrado de items ----

  seleccionarItem(id: number): void {
    this.itemSeleccionadoId.set(this.itemSeleccionadoId() === id ? null : id);
    this.itemConfirmandoEliminacion.set(null);
    this.accionRealizada.emit();
  }

  borrarSeleccionado(): void {
    const id = this.itemSeleccionadoId();
    if (id === null) {
      this.snackBar.open('Selecciona un artículo primero', '', { duration: 1500 });
      return;
    }
    this.quitarItem(id);
  }

  quitarItem(itemId: number): void {
    if (!this.ticket || this.cargando()) return;
    this.cargando.set(true);
    this.ventasService.quitarItem(this.ticket.id, itemId).subscribe({
      next: ticket => {
        this.cargando.set(false);
        this.items.set(ticket.items.map(i => ({ ...i })));
        this.total.set(Number(ticket.total));
        this.itemSeleccionadoId.set(null);
        this.itemConfirmandoEliminacion.set(null);
        this.ticketActualizado.emit(ticket);
        this.accionRealizada.emit();
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('Error al quitar item', '', { duration: 2000 });
      }
    });
  }

  // ---- +/- Cantidad ----

  incrementar(item: DetalleVenta, event: Event): void {
    event.stopPropagation();
    this._incrementar(item);
  }

  decrementar(item: DetalleVenta, event: Event): void {
    event.stopPropagation();
    this._decrementar(item);
  }

  incrementarSeleccionado(): void {
    const id = this.itemSeleccionadoId();
    if (id === null) return;
    const item = this.items().find(i => i.id === id);
    if (item) this._incrementar(item);
  }

  decrementarSeleccionado(): void {
    const id = this.itemSeleccionadoId();
    if (id === null) return;
    const item = this.items().find(i => i.id === id);
    if (item) this._decrementar(item);
  }

  private _incrementar(item: DetalleVenta): void {
    if (!this.ticket || this.cargando()) return;
    if (this.stockMaxAlcanzado(item)) {
      this.snackBar.open('Stock máximo alcanzado', '', { duration: 1500 });
      return;
    }
    this.cargando.set(true);
    this.ventasService.cambiarCantidad(this.ticket.id, item.id, 1).subscribe({
      next: ticket => {
        this.cargando.set(false);
        this.items.set(ticket.items.map(i => ({ ...i })));
        this.total.set(Number(ticket.total));
        this.itemSeleccionadoId.set(item.id);
        this.ticketActualizado.emit(ticket);
        this.accionRealizada.emit();
        const itemActualizado = ticket.items.find(i => i.id === item.id);
        if (itemActualizado && this.puedeAplicarMayoreo(itemActualizado)) {
          this.sugerirMayoreo.emit({ item: itemActualizado, ventaId: ticket.id });
        }
      },
      error: (err) => {
        this.cargando.set(false);
        this.snackBar.open(err.error?.error || 'Error al cambiar cantidad', '', { duration: 2500 });
      }
    });
  }

  private _decrementar(item: DetalleVenta): void {
    if (!this.ticket || this.cargando()) return;
    if (Number(item.cantidad) <= 1) {
      this.itemConfirmandoEliminacion.set(item.id);
      this.itemSeleccionadoId.set(item.id);
      return;
    }
    this.cargando.set(true);
    this.ventasService.cambiarCantidad(this.ticket.id, item.id, -1).subscribe({
      next: ticket => {
        this.cargando.set(false);
        this.items.set(ticket.items.map(i => ({ ...i })));
        this.total.set(Number(ticket.total));
        this.itemSeleccionadoId.set(item.id);
        this.ticketActualizado.emit(ticket);
        this.accionRealizada.emit();
      },
      error: (err) => {
        this.cargando.set(false);
        this.snackBar.open(err.error?.error || 'Error al cambiar cantidad', '', { duration: 2500 });
      }
    });
  }

  cancelarConfirmacionEliminacion(event: Event): void {
    event.stopPropagation();
    this.itemConfirmandoEliminacion.set(null);
    this.accionRealizada.emit();
  }

  confirmarEliminacion(itemId: number, event: Event): void {
    event.stopPropagation();
    this.itemConfirmandoEliminacion.set(null);
    this.quitarItem(itemId);
  }

  stockMaxAlcanzado(item: DetalleVenta): boolean {
    const stock = this.getStock(item);
    if (stock === null) return false;
    console.log('cantidad:', item.cantidad, 'stock:', stock, 'tipo:', item.producto_tipo);
    return Number(item.cantidad) >= Number(stock);
  }

  // ---- Mayoreo por fila ----

  puedeAplicarMayoreo(item: DetalleVenta): boolean {
    if (item.precio_tipo === 'mayoreo') return false;
    if (!item.producto || item.es_producto_comun) return false;
    const prod = this.productoCache.get(item.producto);
    const pm = Number(item.precio_mayoreo ?? prod?.precio_mayoreo ?? 0);
    const mm = Number(item.minimo_mayoreo ?? prod?.minimo_mayoreo ?? 0);
    if (pm <= 0 || mm <= 0) return false;
    return Number(item.cantidad) >= mm;
  }

  puedeRevertirMayoreo(item: DetalleVenta): boolean {
    return item.precio_tipo === 'mayoreo' && !item.es_producto_comun && !!item.producto;
  }

  precioMayoreoItem(item: DetalleVenta): number {
    if (!item.producto) return 0;
    const prod = this.productoCache.get(item.producto);
    return Number(item.precio_mayoreo ?? prod?.precio_mayoreo ?? 0);
  }

  aplicarMayoreo(item: DetalleVenta, activar: boolean, event: Event): void {
    event.stopPropagation();
    if (!this.ticket || !item.producto || this.cargando()) return;
    this.cargando.set(true);
    this.ventasService.aplicarMayoreoItem(this.ticket.id, item.id, activar).subscribe({
      next: ticket => {
        this.cargando.set(false);
        this.items.set(ticket.items.map(i => ({ ...i })));
        this.total.set(Number(ticket.total));
        this.itemSeleccionadoId.set(item.id);
        this.ticketActualizado.emit(ticket);
        this.accionRealizada.emit();
        this.snackBar.open(activar ? 'Precio mayoreo aplicado' : 'Precio normal restaurado', '', { duration: 1500 });
      },
      error: (err) => {
        this.cargando.set(false);
        const msg = err.error?.error || 'Error al aplicar mayoreo';
        this.snackBar.open(msg, '', { duration: 2500 });
      }
    });
  }

  // ---- Stock display ----

  getStock(item: DetalleVenta): number | null {
    // != null captura tanto null como undefined (null del backend para productos comunes)
    if (item.inventario_actual != null) return Number(item.inventario_actual);
    if (!item.producto) return null;
    const prod = this.productoCache.get(item.producto);
    return prod ? Number(prod.inventario_actual) : null;
  }

  // ---- Cobro modal ----

  abrirCobro(): void {
    if (this.items().length === 0) return;
    this.metodoPago.set('efectivo');
    this.montoRecibido.set(this.total());
    this.montoTarjeta.set(0);
    this.clienteCreditoSel.set(null);
    this.busquedaCredito.set('');
    this.mostrarCobro.set(true);
  }

  onMetodoCambiado(metodo: string): void {
    this.metodoPago.set(metodo as 'efectivo' | 'tarjeta' | 'mixto' | 'credito');
    if (metodo === 'efectivo') {
      this.montoRecibido.set(this.total());
    } else if (metodo === 'mixto') {
      this.montoRecibido.set(0);
      this.montoTarjeta.set(0);
    } else if (metodo === 'credito' && this.clientesCredito().length === 0) {
      this.cargandoClientes.set(true);
      this.creditosService.getClientes().subscribe({
        next: clientes => {
          this.clientesCredito.set(clientes);
          this.cargandoClientes.set(false);
        },
        error: () => {
          this.cargandoClientes.set(false);
          this.snackBar.open('Error al cargar clientes de crédito', '', { duration: 2000 });
        }
      });
    }
  }

  onKeydownCredito(event: KeyboardEvent): void {
    const lista = this.clientesCreditoFiltrados();
    if (lista.length === 0) return;
    const selId = this.clienteCreditoSel()?.id ?? null;
    const idx = selId !== null ? lista.findIndex(c => c.id === selId) : -1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.clienteCreditoSel.set(lista[idx < lista.length - 1 ? idx + 1 : 0]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.clienteCreditoSel.set(lista[idx > 0 ? idx - 1 : lista.length - 1]);
    }
  }

  cerrarCobro(): void {
    this.mostrarCobro.set(false);
    this.accionRealizada.emit();
  }

  get vuelto(): number {
    if (this.metodoPago() === 'efectivo') {
      return Math.max(this.montoRecibido() - this.total(), 0);
    }
    if (this.metodoPago() === 'mixto') {
      const efectivo = this.total() - this.montoTarjeta();
      return Math.max(this.montoRecibido() - efectivo, 0);
    }
    return 0;
  }

  confirmarPago(imprimir: boolean): void {
    if (!this.ticket) return;
    const metodo = this.metodoPago();

    if (metodo === 'credito' && !this.clienteCreditoSel()) {
      this.snackBar.open('Debes seleccionar un cliente de crédito', '', { duration: 2500 });
      return;
    }

    const ventaActual = this.ticket;
    const datos: any = { metodo };

    if (metodo === 'efectivo') {
      datos.monto_recibido = this.montoRecibido();
    } else if (metodo === 'tarjeta') {
      datos.monto_recibido = this.total();
    } else if (metodo === 'mixto') {
      datos.monto_tarjeta = this.montoTarjeta();
      datos.monto_recibido = this.montoRecibido();
    } else if (metodo === 'credito') {
      datos.cliente_credito_id = this.clienteCreditoSel()!.id;
    }

    this.cargando.set(true);
    this.ventasService.confirmar(this.ticket.id, datos).subscribe({
      next: ticketData => {
        this.cargando.set(false);
        this.mostrarCobro.set(false);
        if (imprimir) {
          const datosPrint: DatosTicket = {
            numero: ticketData.numero,
            fecha: ticketData.generado,
            cajero: ventaActual.usuario_nombre,
            productos: ventaActual.items.map(i => ({
              nombre: i.producto_nombre,
              cantidad: Number(i.cantidad),
              precio_unitario: Number(i.precio_unitario),
              precio_tipo: i.precio_tipo,
              subtotal: Number(i.subtotal),
            })),
            total: Number(ventaActual.total),
            pagos: ticketData.pagos,
            cliente_factura: ventaActual.cliente_factura_nombre
              ? {
                  nombre:   ventaActual.cliente_factura_nombre,
                  rut:      ventaActual.cliente_factura_rut      ?? '',
                  correo:   ventaActual.cliente_factura_correo   ?? null,
                  telefono: ventaActual.cliente_factura_telefono ?? null,
                }
              : null,
          };
          if (datosPrint.cliente_factura) {
            this.snackBar.open('Imprimiendo 2 copias (cliente y comercio)', '', { duration: 2500 });
            this.imprimirDosTickets(datosPrint);
          } else {
            this.impresionService.imprimirTicket(datosPrint);
          }
        }
        this.ticketCompletado.emit(ventaActual.id);
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('Error al confirmar pago', '', { duration: 2000 });
      }
    });
  }

  cancelarVenta(): void {
    if (!this.ticket) return;
    if (!confirm('¿Cancelar esta venta?')) return;
    this.ventasService.cancelar(this.ticket.id).subscribe({
      next: () => {
        this.mostrarCobro.set(false);
        this.ticketCompletado.emit(this.ticket!.id);
      },
      error: () => this.snackBar.open('Error al cancelar', '', { duration: 2000 })
    });
  }

  // ---- Reimprimir último ticket ----

  reimprimir(): void {
    this.ventasService.ultimoTicket().subscribe({
      next: data => {
        const datos: DatosTicket = {
          numero: data.ticket.numero,
          fecha: data.ticket.generado,
          cajero: data.venta.usuario,
          productos: data.productos.map((p: any) => ({
            nombre: p.nombre,
            cantidad: Number(p.cantidad),
            precio_unitario: Number(p.precio_unitario),
            precio_tipo: p.precio_tipo,
            subtotal: Number(p.subtotal),
          })),
          total: Number(data.venta.total),
          pagos: data.pagos,
          cliente_factura: data.venta.cliente_factura ?? null,
        };
        if (datos.cliente_factura) {
          this.datosReimprimir.set(datos);
          this.dialogReimprimir.set(true);
        } else {
          this.impresionService.imprimirTicket(datos);
          this.snackBar.open('Ticket enviado a imprimir', '', { duration: 2000 });
        }
      },
      error: err => {
        if (err.status === 404) {
          this.snackBar.open('No hay ventas registradas aún', '', { duration: 2500 });
        } else {
          this.snackBar.open('Error al obtener el último ticket', '', { duration: 2000 });
        }
      }
    });
  }

  reimprCopiaCliente(): void {
    const datos = this.datosReimprimir();
    if (!datos) return;
    this.impresionService.imprimirTicket({ ...datos, copia: 'COPIA CLIENTE' });
    this.dialogReimprimir.set(false);
    this.snackBar.open('Ticket enviado a imprimir', '', { duration: 2000 });
  }

  reimprCopiaComercio(): void {
    const datos = this.datosReimprimir();
    if (!datos) return;
    this.impresionService.imprimirTicket({ ...datos, copia: 'COPIA COMERCIO' }, 'venta_sin_iva');
    this.dialogReimprimir.set(false);
    this.snackBar.open('Ticket enviado a imprimir', '', { duration: 2000 });
  }

  reimprAmbasCopias(): void {
    const datos = this.datosReimprimir();
    if (!datos) return;
    this.imprimirDosTickets(datos);
    this.dialogReimprimir.set(false);
    this.snackBar.open('Imprimiendo 2 copias...', '', { duration: 2000 });
  }

  cerrarDialogReimprimir(): void {
    this.dialogReimprimir.set(false);
    this.datosReimprimir.set(null);
  }

  private imprimirDosTickets(datos: DatosTicket): void {
    this.impresionService.imprimirTicket({ ...datos, copia: 'COPIA CLIENTE' });
    setTimeout(() => {
      this.impresionService.imprimirTicket({ ...datos, copia: 'COPIA COMERCIO' }, 'venta_sin_iva');
    }, 1500);
  }

  ventasDia(): void {
    this.snackBar.open('Módulo en desarrollo', '', { duration: 2000 });
  }

  // ---- Quitar cliente factura ----

  quitarClienteFactura(): void {
    if (!this.ticket) return;
    this.ventasService.asignarClienteFactura(this.ticket.id, null).subscribe({
      next: (ticket) => {
        this.ticketActualizado.emit(ticket);
        this.accionRealizada.emit();
      },
      error: () => this.snackBar.open('Error al quitar cliente', '', { duration: 2000 }),
    });
  }
}
