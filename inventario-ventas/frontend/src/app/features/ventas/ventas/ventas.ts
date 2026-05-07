import { Component, OnInit, AfterViewInit, signal, ViewChild, ElementRef, HostListener, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { VentasService, Venta, Producto, DetalleVenta } from '../../../core/services/ventas';
import { AuthService } from '../../../core/services/auth';
import { ImpresionService, DatosTicket } from '../../../core/services/impresion';
import { TicketPanelComponent } from '../ticket-panel/ticket-panel';
import { ProductoSearchComponent } from '../producto-search/producto-search';
import { NavbarComponent } from '../../../shared/components/navbar/navbar';
import { CantidadGranelDialog, CantidadGranelResult } from '../cantidad-granel-dialog/cantidad-granel-dialog';
import { SugerenciaMayoreoDialog, SugerenciaMayoreoData } from '../sugerencia-mayoreo-dialog/sugerencia-mayoreo-dialog';
import { AsignarClienteDialogComponent } from '../asignar-cliente-dialog/asignar-cliente-dialog';
import { ConfirmarBorrarDialog } from '../confirmar-borrar-dialog/confirmar-borrar-dialog';
import { CantidadDevolucionDialog, CantidadDevolucionResult } from '../cantidad-devolucion-dialog/cantidad-devolucion-dialog';
import { DescuentoDialog, DescuentoDialogResult } from '../descuento-dialog/descuento-dialog';
import { ClienteFactura } from '../../../core/services/clientes-factura';
import { LogsService } from '../../../core/services/logs';

// ─── Dialog: aviso de cambio de ticket ──────────────────────────────────────
@Component({
  selector: 'app-ticket-cambio-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <div style="padding:28px 32px; text-align:center;">
      <div style="font-size:1.25rem; margin-bottom:20px; line-height:1.4;">
        ⚠️ Cambiaste al <strong>Ticket {{ data.numero }}</strong>
      </div>
      <button mat-raised-button color="primary" [mat-dialog-close]="true" style="min-width:120px; font-size:1rem;">
        OK
      </button>
    </div>
  `,
})
export class TicketCambioDialog {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { numero: number | string }) {}
}

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    TicketPanelComponent,
    ProductoSearchComponent,
    NavbarComponent,
  ],
  templateUrl: './ventas.html',
  styleUrl: './ventas.scss'
})
export class VentasComponent implements OnInit, AfterViewInit {
  @ViewChild('barcodeInput') barcodeInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild(TicketPanelComponent) ticketPanelRef!: TicketPanelComponent;

  tickets = signal<Venta[]>([]);
  ticketActivo = signal<Venta | null>(null);
  ticketActivoIndex = signal(0);
  cargando = signal(false);
  productoCache = signal<Map<number, Producto>>(new Map());

  // Modal artículo común
  mostrarComun = signal(false);
  comunNombre = '';
  comunCantidad = 1;
  comunPrecio = 0;

  // Modal buscador
  mostrarBuscador = signal(false);

  // Modal devolución
  mostrarDevolucion = signal(false);

  // Modal cotizaciones
  mostrarCotizaciones = signal(false);
  cotizaciones = signal<any[]>([]);
  cotizacionesCargando = signal(false);
  busquedaCotizacion = '';

  // Búsqueda por código de barras
  codigoBarras = '';
  buscandoCodigo = false;
  inputBloqueado = false;
  private _ultimoProductoAgregadoId: number | null = null;
  private _cargaInicial = true;

  constructor(
    public ventasService: VentasService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private impresionService: ImpresionService,
    private logsService: LogsService,
  ) {}

  ngOnInit(): void {
    this.cargarTickets();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.barcodeInputRef?.nativeElement.focus(), 300);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const enInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    const modalAbierta = this.mostrarComun() || this.mostrarBuscador() || this.mostrarDevolucion() || this.mostrarCotizaciones() || (this.ticketPanelRef?.mostrarCobro() ?? false) || this.dialog.openDialogs.length > 0;

    switch (event.key) {
      case 'F10':
        event.preventDefault();
        if (!modalAbierta) this.abrirBuscador();
        break;
      case 'F12':
        event.preventDefault();
        if (!this.mostrarComun() && !this.mostrarBuscador()) {
          this.ticketPanelRef?.abrirCobro();
        }
        break;
      case 'Insert':
        event.preventDefault();
        if (!modalAbierta) this.abrirArticuloComun();
        break;
      case 'Delete': {
        const esBarcodeInput = document.activeElement === this.barcodeInputRef?.nativeElement;
        const barcodeVacio = !this.codigoBarras.trim();
        if (!modalAbierta && (!enInput || (esBarcodeInput && barcodeVacio))) {
          event.preventDefault();
          this.borrarArticuloSeleccionado();
        }
        break;
      }
      case 'Escape':
        if (this.mostrarComun()) { this.cerrarComun(); }
        else if (this.mostrarBuscador()) { this.cerrarBuscador(); }
        else if (this.mostrarDevolucion()) { this.cerrarDevolucion(); }
        else if (this.mostrarCotizaciones()) { this.cerrarCotizaciones(); }
        else { this.ticketPanelRef?.cerrarCobro(); }
        break;
    }
  }

  // ---- Código de barras ----

  onCodigoKeydown(event: KeyboardEvent): void {
    if (this.codigoBarras.trim().length > 0) return;
    if (event.key === '+') {
      event.preventDefault();
      this.ticketPanelRef?.incrementarSeleccionado();
    } else if (event.key === '-') {
      event.preventDefault();
      this.ticketPanelRef?.decrementarSeleccionado();
    } else if (event.key === '*') {
      event.preventDefault();
      this.abrirModificarGranel();
    }
  }

  buscarPorCodigo(): void {
    const codigo = this.codigoBarras.trim();
    if (!codigo || !this.ticketActivo() || this.buscandoCodigo) return;
    this.buscandoCodigo = true;
    const ticketId = this.ticketActivo()!.id;
    const t0 = performance.now();
    this.ventasService.buscarProducto(codigo).subscribe({
      next: productos => {
        this.buscandoCodigo = false;
        const duracion = Math.round(performance.now() - t0);
        const exacto = productos.find(p => p.codigo.toLowerCase() === codigo.toLowerCase());
        if (!exacto) {
          this.logsService.registrar('VENTA', 'ventas',
            `Escaneo: "${codigo}" — no encontrado`,
            undefined, 'WARNING',
            { ticket_id: ticketId, duracion_ms: duracion, datos_extra: { codigo, resultado: 'no_encontrado' } });
          this.snackBar.open(`Producto no encontrado: "${codigo}"`, '', { duration: 2500 });
          this.codigoBarras = '';
          return;
        }
        this.logsService.registrar('VENTA', 'ventas',
          `Escaneo: "${codigo}" → ${exacto.nombre}`,
          undefined, 'INFO',
          { ticket_id: ticketId, duracion_ms: duracion,
            datos_extra: { codigo, resultado: 'encontrado', nombre: exacto.nombre, id: exacto.id } });
        this.codigoBarras = '';
        this.agregarProductoAlTicket(exacto);
      },
      error: () => {
        this.buscandoCodigo = false;
        this.snackBar.open('Error al buscar producto', '', { duration: 2000 });
      }
    });
  }

  agregarProductoAlTicket(producto: Producto): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    this.agregarACache(producto);
    if (producto.tipo === 'granel') {
      this.abrirDialogoGranel(producto, ticket.id);
      return;
    }
    this.ventasService.agregarItem(ticket.id, producto.id, 1, false).subscribe({
      next: ticketActualizado => {
        // #2 — No usar scroll-al-último: resaltar el item específico (esté donde esté)
        const itemSumado = ticketActualizado.items.find(i => i.producto === producto.id);
        this.onTicketActualizado(ticketActualizado, false);
        if (itemSumado) {
          setTimeout(() => this.ticketPanelRef?.resaltarItem(itemSumado.id), 0);
          this.verificarSugerenciaMayoreo(itemSumado, ticketActualizado.id);
        }
        this.refocusBarcodeInput();
      },
      error: (err) => {
        const msg = err.error?.error || 'Error al agregar producto';
        this.snackBar.open(msg, '', { duration: 3000 });
        this.refocusBarcodeInput();
      }
    });
  }

  onGranelSeleccionadoDesdeModal(producto: Producto): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    this.agregarACache(producto);
    this.cerrarBuscador();
    this.abrirDialogoGranel(producto, ticket.id);
  }

  private abrirDialogoGranel(producto: Producto, ticketId: number): void {
    this.bloquearInput();
    const dialogRef = this.dialog.open(CantidadGranelDialog, {
      data: { producto, precio_unitario: producto.precio_venta },
      width: '420px',
      disableClose: false,
    });
    dialogRef.afterClosed().subscribe((resultado: CantidadGranelResult | null) => {
      this.desbloquearInput();
      if (resultado && resultado.cantidad > 0) {
        this.ventasService.agregarItem(ticketId, producto.id, resultado.cantidad, false).subscribe({
          next: ticketActualizado => {
            this.onTicketActualizado(ticketActualizado, true);
          },
          error: (err) => {
            const msg = err.error?.error || 'Error al agregar producto';
            this.snackBar.open(msg, '', { duration: 3000 });
          }
        });
      }
    });
  }

  verificarSugerenciaMayoreo(item: DetalleVenta, ventaId: number): void {
    const cantidad = Number(item.cantidad);
    const minimo = Number(item.minimo_mayoreo ?? 0);
    const precioMayoreo = Number(item.precio_mayoreo ?? 0);
    if (precioMayoreo <= 0 || minimo <= 0 || cantidad < minimo || item.precio_tipo === 'mayoreo') return;

    this.bloquearInput();
    const data: SugerenciaMayoreoData = {
      nombre: item.producto_nombre,
      cantidad,
      precioNormal: Number(item.precio_unitario),
      precioMayoreo,
      totalNormal: Number(item.subtotal),
      totalMayoreo: precioMayoreo * cantidad,
    };
    const dialogRef = this.dialog.open(SugerenciaMayoreoDialog, {
      width: '380px',
      disableClose: false,
      data,
    });
    dialogRef.afterClosed().subscribe((aplicar: boolean | null) => {
      this.desbloquearInput();
      if (aplicar === true) {
        this.ventasService.aplicarMayoreoItem(ventaId, item.id, true).subscribe({
          next: ticket => this.onTicketActualizado(ticket),
          error: (err) => this.snackBar.open(err.error?.error || 'Error al aplicar mayoreo', '', { duration: 2500 }),
        });
      }
    });
  }

  onSugerirMayoreo(data: { item: DetalleVenta; ventaId: number }): void {
    this.verificarSugerenciaMayoreo(data.item, data.ventaId);
  }

  bloquearInput(): void {
    this.inputBloqueado = true;
  }

  desbloquearInput(): void {
    this.inputBloqueado = false;
    setTimeout(() => {
      if (!this.inputBloqueado) {
        this.barcodeInputRef?.nativeElement.focus();
      }
    }, 100);
  }

  onInputBlur(): void {
    // No recuperar foco automáticamente al perderlo — el usuario lo recupera manualmente
    // o haciendo click en un área que no sea otro input (ver onDocumentClick)
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const esInput = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    !!target.closest('input') ||
                    !!target.closest('textarea');
    const hayDialog = this.dialog.openDialogs.length > 0;
    const hayModal = this.mostrarComun() || this.mostrarBuscador() ||
                     this.mostrarDevolucion() || this.mostrarCotizaciones() ||
                     (this.ticketPanelRef?.mostrarCobro() ?? false);

    if (!esInput && !hayDialog && !hayModal) {
      setTimeout(() => this.barcodeInputRef?.nativeElement?.focus(), 50);
    }
  }

  refocusBarcodeInput(): void {
    if (this.inputBloqueado) return;
    if (this.dialog.openDialogs.length > 0) return;
    setTimeout(() => {
      if (this.inputBloqueado) return;
      if (this.dialog.openDialogs.length > 0) return;
      const cobroAbierto = this.ticketPanelRef?.mostrarCobro() ?? false;
      if (!this.mostrarComun() && !this.mostrarBuscador() && !this.mostrarDevolucion() && !cobroAbierto) {
        this.barcodeInputRef?.nativeElement.focus();
      }
    }, 100);
  }

  // ---- Cache de productos para mayoreo badge ----

  agregarACache(producto: Producto): void {
    this.productoCache.update(cache => {
      const nuevo = new Map(cache);
      nuevo.set(producto.id, producto);
      return nuevo;
    });
  }

  onProductoAgregadoDesdeModal(producto: Producto): void {
    this.agregarACache(producto);
    this._ultimoProductoAgregadoId = producto.id;
  }

  // ---- Acciones de ticket ----

  borrarArticuloSeleccionado(): void {
    if (!this.ticketPanelRef?.hayFilaSeleccionada()) return;
    this.bloquearInput();
    const ref = this.dialog.open(ConfirmarBorrarDialog, { disableClose: false });
    ref.afterClosed().subscribe(confirmado => {
      if (confirmado) this.ticketPanelRef?.borrarSeleccionado();
      this.refocusBarcodeInput();
    });
  }

  eliminarTicketActivo(): void {
    if (this.tickets().length <= 1) return;
    const ticket = this.ticketActivo();
    if (!ticket) return;
    if (!confirm('¿Eliminar este ticket?')) return;
    this.ventasService.cancelar(ticket.id).subscribe({
      next: () => {
        this.tickets.update(ts => ts.filter(t => t.id !== ticket.id));
        const restantes = this.tickets();
        this.seleccionarTicket(restantes[0], 0);
        this.snackBar.open('Ticket eliminado', '', { duration: 2000 });
      },
      error: () => this.snackBar.open('Error al eliminar ticket', '', { duration: 2000 })
    });
  }

  mostrarMsgDesarrollo(): void {
    this.snackBar.open('Módulo en desarrollo', '', { duration: 2000 });
  }

  // ---- Modal artículo común ----

  abrirArticuloComun(): void {
    this.bloquearInput();
    this.comunNombre = '';
    this.comunCantidad = 1;
    this.comunPrecio = 0;
    this.mostrarComun.set(true);
    const tid = this.ticketActivo()?.id;
    this.logsService.registrar('VENTA', 'ventas', 'Dialog abierto: artículo común',
      undefined, 'INFO', { ticket_id: tid, datos_extra: { dialog: 'articulo_comun' } });
  }

  cerrarComun(): void {
    this.mostrarComun.set(false);
    this.desbloquearInput();
  }

  agregarComun(): void {
    const ticket = this.ticketActivo();
    if (!ticket || !this.comunNombre.trim() || this.comunPrecio <= 0 || this.comunCantidad === 0) {
      this.snackBar.open('Completa el nombre y el precio', '', { duration: 2000 });
      return;
    }
    if (this.comunNombre.length > 200) {
      this.snackBar.open('Nombre: máximo 200 caracteres', '', { duration: 2500 });
      return;
    }
    this.ventasService.agregarProductoComun(ticket.id, this.comunNombre, this.comunCantidad, this.comunPrecio).subscribe({
      next: ticketActualizado => {
        this.onTicketActualizado(ticketActualizado, true);
        this.cerrarComun();
        this.snackBar.open('Artículo común agregado', '', { duration: 1500 });
      },
      error: () => this.snackBar.open('Error al agregar artículo', '', { duration: 2000 })
    });
  }

  // ---- Modal buscador ----

  abrirBuscador(): void {
    this.bloquearInput();
    this.mostrarBuscador.set(true);
    const tid = this.ticketActivo()?.id;
    this.logsService.registrar('VENTA', 'ventas', 'Dialog abierto: buscador (F10)',
      undefined, 'INFO', { ticket_id: tid, datos_extra: { dialog: 'buscador' } });
  }

  cerrarBuscador(): void {
    this.mostrarBuscador.set(false);
    this.desbloquearInput();
  }

  onItemAgregadoDesdeModal(ticket: Venta): void {
    this.onTicketActualizado(ticket, true);
    const itemAgregado = this._ultimoProductoAgregadoId
      ? ticket.items.find(i => i.producto === this._ultimoProductoAgregadoId)
      : undefined;
    this._ultimoProductoAgregadoId = null;
    this.cerrarBuscador();
    if (itemAgregado) this.verificarSugerenciaMayoreo(itemAgregado, ticket.id);
  }

  // ---- Modal devolución ----

  abrirDevolucion(): void {
    this.bloquearInput();
    this.mostrarDevolucion.set(true);
    const tid = this.ticketActivo()?.id;
    this.logsService.registrar('VENTA', 'ventas', 'Dialog abierto: devolución',
      undefined, 'INFO', { ticket_id: tid, datos_extra: { dialog: 'devolucion' } });
  }

  cerrarDevolucion(): void {
    this.mostrarDevolucion.set(false);
    this.desbloquearInput();
  }

  onDevolucionSeleccionada(producto: Producto): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    if (producto.tipo === 'kit') {
      this.snackBar.open('No se pueden devolver kits directamente', '', { duration: 2500 });
      return;
    }
    this.agregarACache(producto);
    this.cerrarDevolucion();
    this.bloquearInput();
    const dialogRef = this.dialog.open(CantidadDevolucionDialog, {
      data: { producto, precio_unitario: producto.precio_venta },
      width: '380px',
      disableClose: false,
    });
    dialogRef.afterClosed().subscribe((resultado: CantidadDevolucionResult | null) => {
      this.desbloquearInput();
      if (!resultado) return;
      this.ventasService.agregarDevolucion(ticket.id, producto.id, resultado.cantidad, producto.precio_venta).subscribe({
        next: ticketActualizado => {
          this.onTicketActualizado(ticketActualizado, true);
          this.snackBar.open(`Devolución: ${producto.nombre} (x${resultado.cantidad})`, '', { duration: 1500 });
        },
        error: (err) => {
          const msg = err.error?.error || 'Error al agregar devolución';
          this.snackBar.open(msg, '', { duration: 3000 });
        }
      });
    });
  }

  // ---- Modal descuento ----

  abrirDescuento(): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    const totalItems = ticket.items.filter(i => Number(i.cantidad) > 0).reduce((s, i) => s + Number(i.subtotal), 0);
    if (totalItems <= 0) {
      this.snackBar.open('El ticket no tiene artículos con precio', '', { duration: 2000 });
      return;
    }
    this.logsService.registrar('VENTA', 'ventas', 'Dialog abierto: descuento',
      undefined, 'INFO', { ticket_id: ticket.id, datos_extra: { dialog: 'descuento', total: totalItems } });
    this.bloquearInput();
    const dialogRef = this.dialog.open(DescuentoDialog, {
      data: { total: totalItems },
      width: '400px',
      disableClose: false,
    });
    dialogRef.afterClosed().subscribe((resultado: DescuentoDialogResult | null) => {
      this.desbloquearInput();
      if (!resultado) return;
      this.ventasService.agregarDescuento(ticket.id, resultado.monto, resultado.porcentaje).subscribe({
        next: ticketActualizado => {
          this.onTicketActualizado(ticketActualizado, true);
          this.snackBar.open(`Descuento de ${resultado.porcentaje.toFixed(2)}% aplicado`, '', { duration: 2000 });
        },
        error: (err) => {
          const msg = err.error?.error || 'Error al aplicar descuento';
          this.snackBar.open(msg, '', { duration: 3000 });
        }
      });
    });
  }

  // ---- Tickets ----

  private asignarNumeroDisplay(ticket: Venta): Venta {
    const guardado = this.ventasService.getNumeroTicket(ticket.id);
    if (guardado !== undefined) {
      return { ...ticket, numero_display: guardado };
    }
    const nuevo = this.ventasService.siguienteNumero();
    this.ventasService.guardarNumeroTicket(ticket.id, nuevo);
    return { ...ticket, numero_display: nuevo };
  }

  cargarTickets(): void {
    this.cargando.set(true);
    this.ventasService.getTicketsAbiertos().subscribe({
      next: tickets => {
        if (tickets.length === 0) {
          this.crearPrimerTicket();
        } else {
          const conNumeros = tickets.map(t => this.asignarNumeroDisplay(t));
          this.tickets.set(conNumeros);
          // #1 — Restaurar ticket activo desde localStorage
          const savedId = Number(localStorage.getItem('pos_ticket_activo_id') ?? 0);
          const savedIdx = savedId ? conNumeros.findIndex(t => t.id === savedId) : -1;
          const inicial = savedIdx >= 0 ? conNumeros[savedIdx] : conNumeros[0];
          const inicialIdx = savedIdx >= 0 ? savedIdx : 0;
          const origen = savedIdx >= 0 ? 'restaurado_localStorage' : 'regreso_modulo';
          this.seleccionarTicket(inicial, inicialIdx, origen);
          this.cargando.set(false);
        }
      },
      error: () => this.cargando.set(false)
    });
  }

  crearPrimerTicket(): void {
    this.ventasService.nuevoTicket().subscribe({
      next: ticket => {
        const conNumero = this.asignarNumeroDisplay(ticket);
        this.tickets.set([conNumero]);
        this.seleccionarTicket(conNumero, 0, 'nuevo_ticket');
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  nuevoTicket(): void {
    this.ventasService.nuevoTicket().subscribe({
      next: ticket => {
        const conNumero = this.asignarNumeroDisplay(ticket);
        this.tickets.update(t => [...t, conNumero]);
        this.seleccionarTicket(conNumero, this.tickets().length - 1, 'nuevo_ticket');
        this.snackBar.open('Nuevo ticket creado', '', { duration: 2000 });
      }
    });
  }

  seleccionarTicket(ticket: Venta, index: number, origen = 'click_tab'): void {
    const anterior = this.ticketActivo();

    // #4 — Safeguard: traza todo cambio de ticket con stack para detectar cambios automáticos
    console.warn('[TICKET-CHANGE]', 'de:', anterior?.id ?? null, '→', ticket.id, new Error().stack);

    this.ticketActivo.set(ticket);
    this.ticketActivoIndex.set(index);
    this.ventasService.setTicketActivo(ticket);

    // #1 — Persistir ticket activo en localStorage
    localStorage.setItem('pos_ticket_activo_id', String(ticket.id));

    // #6 — Log CAMBIO_TICKET al backend con origen
    if (!this._cargaInicial && anterior !== null && anterior.id !== ticket.id) {
      this.logsService.registrar(
        'CAMBIO_TICKET', 'ventas',
        `Ticket ${anterior.numero_display ?? anterior.id} → ${ticket.numero_display ?? ticket.id} [${origen}]`,
        undefined, 'INFO',
        { ticket_id: ticket.id, datos_extra: { origen, de: anterior.id, a: ticket.id } },
      );
    }

    // #3 — Aviso de cambio (omitir en carga inicial y cuando no cambia de ticket)
    if (!this._cargaInicial && anterior !== null && anterior.id !== ticket.id) {
      this.bloquearInput();
      const ref = this.dialog.open(TicketCambioDialog, {
        data: { numero: ticket.numero_display ?? ticket.id },
        width: '320px',
        disableClose: true,
      });
      ref.afterClosed().subscribe(() => this.desbloquearInput());
    } else {
      this.refocusBarcodeInput();
    }

    this._cargaInicial = false;
  }

  onTicketActualizado(ticket: Venta, selectUltimoItem = false): void {
    const conNumero = this.asignarNumeroDisplay(ticket);
    this.tickets.update(tickets => tickets.map(t => t.id === conNumero.id ? conNumero : t));
    this.ticketActivo.set(conNumero);
    this.ventasService.setTicketActivo(conNumero);
    if (selectUltimoItem && ticket.items.length > 0) {
      const ultimoItemId = ticket.items[ticket.items.length - 1].id;
      setTimeout(() => {
        this.ticketPanelRef?.seleccionarItem(ultimoItemId);
        this.ticketPanelRef?.scrollAlUltimo();
      }, 0);
    }
  }

  // ---- Asignar cliente factura ----

  onAsignarClienteFactura(): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    this.bloquearInput();
    const dialogRef = this.dialog.open(AsignarClienteDialogComponent, {
      width: '420px',
      disableClose: false,
      data: { clienteActual: ticket.cliente_factura_id ?? null },
    });
    dialogRef.afterClosed().subscribe((cliente: ClienteFactura | null | undefined) => {
      this.desbloquearInput();
      if (cliente) {
        this.asignarClienteATicket(cliente);
      }
    });
  }

  asignarClienteATicket(cliente: ClienteFactura): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    this.ventasService.asignarClienteFactura(ticket.id, cliente.id).subscribe({
      next: (ventaActualizada) => {
        this.onTicketActualizado(ventaActualizada);
        this.snackBar.open(`Cliente "${cliente.nombre}" asignado`, '', { duration: 2000 });
      },
      error: (err) => {
        const msg = err?.error?.error ?? 'Error al asignar cliente';
        this.snackBar.open(msg, '', { duration: 3000 });
      },
    });
  }

  // ---- Modificar cantidad granel (tecla *) ----

  abrirModificarGranel(): void {
    const panel = this.ticketPanelRef;
    if (!panel) return;
    const idSel = panel.itemSeleccionadoId();
    if (idSel === null) {
      this.snackBar.open('Selecciona un artículo granel primero', '', { duration: 1500 });
      return;
    }
    const item = panel.items().find(i => i.id === idSel);
    if (!item || item.producto_tipo !== 'granel') {
      this.snackBar.open('El artículo seleccionado no es granel', '', { duration: 1500 });
      return;
    }
    const ticket = this.ticketActivo();
    if (!ticket) return;

    const productoData: any = {
      id: item.producto!,
      nombre: item.producto_nombre,
      codigo: item.producto_codigo || '',
      tipo: 'granel',
      precio_venta: Number(item.precio_unitario),
      precio_mayoreo: 0,
      minimo_mayoreo: 0,
      inventario_actual: item.inventario_actual ?? 0,
      categoria_nombre: '',
    };

    this.bloquearInput();
    const dialogRef = this.dialog.open(CantidadGranelDialog, {
      data: { producto: productoData, precio_unitario: item.precio_unitario },
      width: '420px',
      disableClose: false,
    });
    dialogRef.afterClosed().subscribe((resultado: CantidadGranelResult | null) => {
      this.desbloquearInput();
      if (resultado && resultado.cantidad > 0) {
        this.ventasService.actualizarItem(ticket.id, item.id, resultado.cantidad).subscribe({
          next: ticketActualizado => this.onTicketActualizado(ticketActualizado),
          error: (err) => {
            this.snackBar.open(err.error?.error || 'Error al actualizar cantidad', '', { duration: 3000 });
          }
        });
      }
    });
  }

  // ---- Cotizaciones ----

  get cotizacionesFiltradas(): any[] {
    const q = this.busquedaCotizacion.toLowerCase().trim();
    if (!q) return this.cotizaciones();
    return this.cotizaciones().filter(c => c.numero.toLowerCase().includes(q));
  }

  cotizarTicket(): void {
    const ticket = this.ticketActivo();
    if (!ticket || ticket.items.length === 0) {
      this.snackBar.open('El ticket está vacío', '', { duration: 1500 });
      return;
    }

    const usuario = this.authService.usuarioActual();

    this.ventasService.crearCotizacion(ticket.id).subscribe({
      next: cot => {
        const datos: DatosTicket = {
          numero: cot.numero,
          fecha: new Date().toISOString(),
          cajero: usuario?.nombre || usuario?.username || 'Cajero',
          productos: ticket.items.map(item => ({
            nombre: item.es_producto_comun ? item.producto_comun_nombre : item.producto_nombre,
            cantidad: Number(item.cantidad),
            precio_unitario: Number(item.precio_unitario),
            precio_tipo: item.precio_tipo,
            subtotal: Number(item.subtotal),
          })),
          total: ticket.total,
          pagos: [{
            metodo: 'efectivo',
            monto_recibido: ticket.total,
            monto_tarjeta: 0,
            vuelto: 0,
          }],
        };

        this.impresionService.imprimirTicket(datos);

        // Limpiar carrito: cancelar ticket activo y abrir uno nuevo
        const ticketId = ticket.id;
        this.tickets.update(ts => ts.filter(t => t.id !== ticketId));
        this.ventasService.cancelar(ticketId).subscribe();
        this.ventasService.nuevoTicket().subscribe({
          next: nuevoTicket => {
            const conNumero = this.asignarNumeroDisplay(nuevoTicket);
            this.tickets.update(ts => [...ts, conNumero]);
            this.seleccionarTicket(conNumero, this.tickets().length - 1);
          }
        });

        this.snackBar.open(`${cot.numero} guardada e impresa`, '', { duration: 2000 });
      },
      error: err => {
        this.snackBar.open(err.error?.error || 'Error al guardar cotización', '', { duration: 2500 });
      }
    });
  }

  abrirBuscarCotizacion(): void {
    this.bloquearInput();
    this.busquedaCotizacion = '';
    this.cotizacionesCargando.set(true);
    this.mostrarCotizaciones.set(true);
    this.ventasService.getCotizaciones().subscribe({
      next: cots => {
        this.cotizaciones.set(cots);
        this.cotizacionesCargando.set(false);
      },
      error: () => {
        this.cotizacionesCargando.set(false);
        this.snackBar.open('Error al cargar cotizaciones', '', { duration: 2000 });
      }
    });
  }

  cerrarCotizaciones(): void {
    this.mostrarCotizaciones.set(false);
    this.desbloquearInput();
  }

  cargarCotizacion(cot: any): void {
    const ticket = this.ticketActivo();
    if (!ticket) return;
    this.ventasService.cargarCotizacion(cot.id, ticket.id).subscribe({
      next: result => {
        this.onTicketActualizado(result.venta, true);
        this.cerrarCotizaciones();
        if (result.advertencias?.length > 0) {
          this.snackBar.open(
            `Cotización cargada. Advertencias: ${result.advertencias.join(', ')}`,
            'OK', { duration: 5000 }
          );
        } else {
          this.snackBar.open(`Cotización ${cot.numero} cargada al carrito`, '', { duration: 2000 });
        }
      },
      error: err => {
        this.snackBar.open(err.error?.error || 'Error al cargar cotización', '', { duration: 2500 });
      }
    });
  }

  eliminarCotizacion(cot: any, event: Event): void {
    event.stopPropagation();
    this.ventasService.eliminarCotizacion(cot.id).subscribe({
      next: () => {
        this.cotizaciones.update(cs => cs.filter(c => c.id !== cot.id));
        this.snackBar.open(`Cotización ${cot.numero} eliminada`, '', { duration: 2000 });
      },
      error: () => this.snackBar.open('Error al eliminar cotización', '', { duration: 2000 })
    });
  }

  // ---- Mayoreo forzado desde barra de acciones ----

  aplicarMayoreoAlSeleccionado(): void {
    const panel = this.ticketPanelRef;
    const ticket = this.ticketActivo();
    if (!panel || !ticket) return;

    const idSel = panel.itemSeleccionadoId();
    if (idSel === null) {
      this.snackBar.open('Selecciona un artículo primero', '', { duration: 1500 });
      return;
    }
    const item = panel.items().find(i => i.id === idSel);
    if (!item) return;

    if (item.es_producto_comun) {
      this.snackBar.open('Los artículos comunes no tienen precio mayoreo', '', { duration: 2000 });
      return;
    }

    const precioMayoreo = Number(item.precio_mayoreo ?? this.productoCache().get(item.producto ?? 0)?.precio_mayoreo ?? 0);
    if (precioMayoreo <= 0) {
      this.snackBar.open('El producto no tiene precio mayoreo configurado', '', { duration: 2000 });
      return;
    }

    const activar = item.precio_tipo !== 'mayoreo';
    this.ventasService.aplicarMayoreoItem(ticket.id, item.id, activar).subscribe({
      next: ticketActualizado => {
        this.onTicketActualizado(ticketActualizado);
        this.snackBar.open(activar ? 'Precio mayoreo aplicado' : 'Precio normal restaurado', '', { duration: 1500 });
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Error al aplicar mayoreo', '', { duration: 2500 });
      }
    });
  }

  onTicketCompletado(ticketId: number): void {
    this.tickets.update(tickets => tickets.filter(t => t.id !== ticketId));
    this.ventasService.nuevoTicket().subscribe({
      next: ticket => {
        const conNumero = this.asignarNumeroDisplay(ticket);
        this.tickets.update(t => [...t, conNumero]);
        this.seleccionarTicket(conNumero, this.tickets().length - 1);
        this.snackBar.open('Venta completada. Nuevo ticket listo.', '', { duration: 2000 });
      }
    });
  }
}
