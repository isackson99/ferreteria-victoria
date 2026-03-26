import { Component, OnInit, AfterViewInit, signal, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { VentasService, Venta, Producto, DetalleVenta } from '../../../core/services/ventas';
import { AuthService } from '../../../core/services/auth';
import { TicketPanelComponent } from '../ticket-panel/ticket-panel';
import { ProductoSearchComponent } from '../producto-search/producto-search';
import { NavbarComponent } from '../../../shared/components/navbar/navbar';
import { CantidadGranelDialog, CantidadGranelResult } from '../cantidad-granel-dialog/cantidad-granel-dialog';
import { SugerenciaMayoreoDialog, SugerenciaMayoreoData } from '../sugerencia-mayoreo-dialog/sugerencia-mayoreo-dialog';
import { AsignarClienteDialogComponent } from '../asignar-cliente-dialog/asignar-cliente-dialog';
import { ClienteFactura } from '../../../core/services/clientes-factura';

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

  // Búsqueda por código de barras
  codigoBarras = '';
  buscandoCodigo = false;
  inputBloqueado = false;
  private _ultimoProductoAgregadoId: number | null = null;

  constructor(
    public ventasService: VentasService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
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
    const modalAbierta = this.mostrarComun() || this.mostrarBuscador() || (this.ticketPanelRef?.mostrarCobro() ?? false) || this.dialog.openDialogs.length > 0;

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
    }
  }

  buscarPorCodigo(): void {
    const codigo = this.codigoBarras.trim();
    if (!codigo || !this.ticketActivo() || this.buscandoCodigo) return;
    this.buscandoCodigo = true;
    this.ventasService.buscarProducto(codigo).subscribe({
      next: productos => {
        this.buscandoCodigo = false;
        if (productos.length === 0) {
          this.snackBar.open(`Producto no encontrado: "${codigo}"`, '', { duration: 2500 });
          this.codigoBarras = '';
          return;
        }
        const exacto = productos.find(p => p.codigo === codigo) ?? productos[0];
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
        this.onTicketActualizado(ticketActualizado, true);
        const itemAgregado = ticketActualizado.items.find(i => i.producto === producto.id);
        if (itemAgregado) this.verificarSugerenciaMayoreo(itemAgregado, ticketActualizado.id);
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
    if (this.inputBloqueado) return;
    setTimeout(() => {
      if (this.inputBloqueado) return;
      const cobroAbierto = this.ticketPanelRef?.mostrarCobro() ?? false;
      if (!this.mostrarComun() && !this.mostrarBuscador() && !cobroAbierto) {
        this.barcodeInputRef?.nativeElement.focus();
      }
    }, 150);
  }

  refocusBarcodeInput(): void {
    if (this.inputBloqueado) return;
    setTimeout(() => {
      if (this.inputBloqueado) return;
      const cobroAbierto = this.ticketPanelRef?.mostrarCobro() ?? false;
      if (!this.mostrarComun() && !this.mostrarBuscador() && !cobroAbierto) {
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
    this.ticketPanelRef?.borrarSeleccionado();
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
  }

  cerrarComun(): void {
    this.mostrarComun.set(false);
    this.desbloquearInput();
  }

  agregarComun(): void {
    const ticket = this.ticketActivo();
    if (!ticket || !this.comunNombre.trim() || this.comunPrecio <= 0) {
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
          this.seleccionarTicket(conNumeros[0], 0);
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
        this.seleccionarTicket(conNumero, 0);
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
        this.seleccionarTicket(conNumero, this.tickets().length - 1);
        this.snackBar.open('Nuevo ticket creado', '', { duration: 2000 });
      }
    });
  }

  seleccionarTicket(ticket: Venta, index: number): void {
    this.ticketActivo.set(ticket);
    this.ticketActivoIndex.set(index);
    this.ventasService.setTicketActivo(ticket);
    this.refocusBarcodeInput();
  }

  onTicketActualizado(ticket: Venta, selectUltimoItem = false): void {
    const conNumero = this.asignarNumeroDisplay(ticket);
    this.tickets.update(tickets => tickets.map(t => t.id === conNumero.id ? conNumero : t));
    this.ticketActivo.set(conNumero);
    this.ventasService.setTicketActivo(conNumero);
    if (selectUltimoItem && ticket.items.length > 0) {
      const ultimoItemId = ticket.items[ticket.items.length - 1].id;
      setTimeout(() => this.ticketPanelRef?.seleccionarItem(ultimoItemId), 0);
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
