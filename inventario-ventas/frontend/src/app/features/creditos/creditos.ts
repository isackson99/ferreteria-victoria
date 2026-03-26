import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule, MatCheckboxChange } from '@angular/material/checkbox';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { ImpresionService, DatosTicketCredito, ModoImpresionCredito } from '../../core/services/impresion';
import {
  CreditosService,
  ClienteCredito,
  CuentaCredito,
  MovimientoCredito,
  VentaCredito,
  VentaGrupo,
  DetalleVentaCredito,
} from '../../core/services/creditos';
import { ProductosService } from '../../core/services/productos';
import { nextSort, sortArr, sortIcon, isActive, SortState, SORT_NONE } from '../../core/utils/sort';

type Vista = 'estado_cuenta' | 'nuevo_cliente' | 'modificar_cliente' | 'eliminar_cliente' | 'reporte_saldos';

@Component({
  selector: 'app-creditos',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatSelectModule, MatSnackBarModule, MatProgressSpinnerModule, MatTooltipModule,
    MatMenuModule, MatCheckboxModule,
    NavbarComponent,
  ],
  templateUrl: './creditos.html',
  styleUrl: './creditos.scss',
})
export class CreditosComponent implements OnInit {
  private creditosService = inject(CreditosService);
  private impresionService = inject(ImpresionService);
  private productosService = inject(ProductosService);
  private snackBar = inject(MatSnackBar);

  readonly Number = Number;
  readonly sortIcon = sortIcon;
  readonly isActive = isActive;

  ordenSaldos = signal<SortState>(SORT_NONE);

  // ── Vista ──────────────────────────────────────────
  vista = signal<Vista>('estado_cuenta');
  subvistaEstado = signal<'seleccion' | 'detalle'>('seleccion');
  subvistaModificar = signal<'seleccion' | 'formulario'>('seleccion');
  subvistaEliminar = signal<'seleccion' | 'confirmar'>('seleccion');

  // ── Datos ──────────────────────────────────────────
  clientes = signal<ClienteCredito[]>([]);
  cuentas = signal<CuentaCredito[]>([]);
  ventasCredito = signal<VentaCredito[]>([]);
  abonosCliente = signal<MovimientoCredito[]>([]);
  abonosHistorial = signal<MovimientoCredito[]>([]);

  // ── Selección ──────────────────────────────────────
  clienteSeleccionado = signal<ClienteCredito | null>(null);
  clienteActual = signal<ClienteCredito | null>(null);
  cuentaActual = signal<CuentaCredito | null>(null);
  ventaSeleccionada = signal<VentaCredito | null>(null);
  cuentaReporteSeleccionada = signal<CuentaCredito | null>(null);

  // ── Loading ────────────────────────────────────────
  cargando = signal(false);
  cargandoVentas = signal(false);
  cargandoDialog = false;

  // ── Búsqueda / filtros ─────────────────────────────
  busquedaCliente = signal('');
  busquedaSaldos  = signal('');
  filtroVentas = signal<'todas' | 'no_liquidadas' | 'liquidadas'>('no_liquidadas');

  // ── Selección múltiple ─────────────────────────────
  ticketsSeleccionados = signal<Set<number>>(new Set());

  // ── Formulario cliente ─────────────────────────────
  formCliente = { nombre: '', direccion: '', telefono: '', limiteCredito: 0 };

  // ── Diálogos ───────────────────────────────────────
  dialogAbonar = false;
  dialogLiquidar = false;
  dialogAbonos = false;
  dialogCostos = false;
  montoAbono: number | null = null;

  // ── Cargar precios costo ────────────────────────────
  guardandoCostos = false;
  costosNuevos: Record<number, number> = {};
  productosSinCostoLista = signal<Array<{ id: number; nombre: string; precio_venta_ref: number }>>([]);

  // ── Computed ───────────────────────────────────────
  clientesFiltrados = computed(() => {
    const q = this.busquedaCliente().toLowerCase().trim();
    if (!q) return this.clientes();
    return this.clientes().filter(c =>
      c.nombre.toLowerCase().includes(q) || String(c.id).includes(q)
    );
  });

  ventasFiltradas = computed(() => {
    const f = this.filtroVentas();
    const todas = this.ventasCredito();
    if (f === 'no_liquidadas') return todas.filter(v => !v.liquidado);
    if (f === 'liquidadas')    return todas.filter(v => v.liquidado);
    return todas;
  });

  ventasAgrupadas = computed((): VentaGrupo[] => {
    const grupos = new Map<string, VentaCredito[]>();
    for (const v of this.ventasFiltradas()) {
      const d = new Date(v.fecha);
      const mes = d.toLocaleDateString('es-MX', { month: 'long' });
      const key = mes.charAt(0).toUpperCase() + mes.slice(1);
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(v);
    }
    return Array.from(grupos.entries()).map(([mes, ventas]) => ({ mes, ventas }));
  });

  algunoSeleccionado = computed(() => this.ticketsSeleccionados().size > 0);

  todosSeleccionados = computed(() => {
    const ventas = this.ventasFiltradas();
    return ventas.length > 0 && ventas.every(v => this.ticketsSeleccionados().has(v.id));
  });

  // Precio especial: precio_costo real (sin dividir); fallback a precio_unitario si costo = 0
  precioEspecialItem(item: DetalleVentaCredito): number {
    return Number(item.precio_costo) > 0 ? Number(item.precio_costo) : Number(item.precio_unitario);
  }

  itemUsaFallback(item: DetalleVentaCredito): boolean {
    return Number(item.precio_costo) <= 0;
  }

  totalEspecialVenta(venta: VentaCredito): number {
    return venta.items.reduce(
      (sum, item) => sum + this.precioEspecialItem(item) * Number(item.cantidad), 0
    );
  }

  // Items del ticket seleccionado que no tienen precio_costo cargado
  itemsSinCostoVentaSeleccionada = computed(() => {
    if (!this.clienteActual()?.precio_especial) return [];
    const venta = this.ventaSeleccionada();
    if (!venta) return [];
    return venta.items.filter(i => Number(i.precio_costo) <= 0 && i.producto_id);
  });

  alertaSinCostoTexto = computed(() => {
    const items = this.itemsSinCostoVentaSeleccionada();
    const nombres = items.slice(0, 3).map(i => i.descripcion);
    return nombres.join(', ') + (items.length > 3 ? '...' : '');
  });

  saldoEspecial = computed(() => {
    const cliente = this.clienteActual();
    if (!cliente?.precio_especial) return null;
    return this.ventasCredito()
      .filter(v => !v.liquidado)
      .reduce((sum, v) => sum + this.totalEspecialVenta(v), 0);
  });

  saldoMostrado = computed(() => {
    const especial = this.saldoEspecial();
    if (especial !== null) return especial;
    return Number(this.cuentaActual()?.saldo_usado ?? 0);
  });

  nuevoSaldo = computed(() => {
    if (this.montoAbono === null) return null;
    return Math.max(0, this.saldoMostrado() - (this.montoAbono ?? 0));
  });

  totalSaldosPendientes = computed(() =>
    this.cuentas().reduce((sum, c) => sum + Number(c.saldo_usado), 0)
  );

  cuentasFiltradas = computed(() => {
    const q = this.busquedaSaldos().toLowerCase().trim();
    let res = this.cuentas();
    if (q) res = res.filter(c =>
      (c.cliente_nombre ?? '').toLowerCase().includes(q) ||
      (c.cliente_direccion ?? '').toLowerCase().includes(q) ||
      (c.cliente_telefono ?? '').toLowerCase().includes(q)
    );
    return sortArr(res, this.ordenSaldos());
  });

  // ── Inicialización ─────────────────────────────────
  ngOnInit() {
    this.cargarClientes();
  }

  cargarClientes() {
    this.creditosService.getClientes().subscribe({
      next: (data) => {
        this.clientes.set(data);
        if (data.length > 0) this.clienteSeleccionado.set(data[0]);
      },
      error: () => {},
    });
  }

  ordenarSaldos(col: string) {
    this.ordenSaldos.set(nextSort(this.ordenSaldos(), col));
  }

  // ── Navegación ─────────────────────────────────────
  setVista(v: Vista) {
    this.vista.set(v);
    this.busquedaCliente.set('');
    this.busquedaSaldos.set('');
    if (v !== 'reporte_saldos') this.ordenSaldos.set(SORT_NONE);
    if (this.clientes().length > 0) this.clienteSeleccionado.set(this.clientes()[0]);
    if (v === 'estado_cuenta') this.subvistaEstado.set('seleccion');
    if (v === 'modificar_cliente') this.subvistaModificar.set('seleccion');
    if (v === 'eliminar_cliente') this.subvistaEliminar.set('seleccion');
    if (v === 'nuevo_cliente') this.resetForm();
    if (v === 'reporte_saldos') this.cargarCuentas();
  }

  // ── Selección con teclado ──────────────────────────
  onKeydownSelector(event: KeyboardEvent) {
    const lista = this.clientesFiltrados();
    const actual = this.clienteSeleccionado();
    const idx = actual ? lista.findIndex(c => c.id === actual.id) : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = lista[Math.min(idx + 1, lista.length - 1)];
      if (next) this.clienteSeleccionado.set(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = lista[Math.max(idx - 1, 0)];
      if (prev) this.clienteSeleccionado.set(prev);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.aceptarSeleccion();
    }
  }

  // ── Aceptar selección ──────────────────────────────
  aceptarSeleccion() {
    const c = this.clienteSeleccionado();
    if (!c) return;
    this.clienteActual.set(c);

    if (this.vista() === 'estado_cuenta') {
      this.ventaSeleccionada.set(null);
      this.cuentaActual.set(null);
      this.ventasCredito.set([]);
      this.abonosCliente.set([]);
      this.ticketsSeleccionados.set(new Set());
      if (c.cuenta_id) {
        this.cargarCuenta(c.cuenta_id);
        this.cargarVentasCliente(c.cuenta_id);
      }
      this.subvistaEstado.set('detalle');
    } else if (this.vista() === 'modificar_cliente') {
      this.formCliente = {
        nombre: c.nombre,
        direccion: c.direccion ?? '',
        telefono: c.telefono ?? '',
        limiteCredito: c.credito_ilimitado ? 0 : Number(c.credito_maximo ?? 0),
      };
      this.subvistaModificar.set('formulario');
    } else if (this.vista() === 'eliminar_cliente') {
      this.subvistaEliminar.set('confirmar');
    }
  }

  // ── Carga de datos ─────────────────────────────────
  cargarCuenta(cuentaId: number) {
    this.creditosService.getCuenta(cuentaId).subscribe({
      next: (c) => this.cuentaActual.set(c),
      error: () => {},
    });
  }

  cargarVentasCliente(cuentaId: number) {
    this.cargandoVentas.set(true);
    forkJoin({
      ventas: this.creditosService.getVentasCredito(cuentaId),
      abonos: this.creditosService.getAbonos(cuentaId),
    }).subscribe({
      next: ({ ventas, abonos }) => {
        this.abonosCliente.set(abonos);
        this.ventasCredito.set(this.calcularLiquidacion(ventas, abonos));
        this.cargandoVentas.set(false);
      },
      error: () => this.cargandoVentas.set(false),
    });
  }

  private calcularLiquidacion(ventas: VentaCredito[], abonos: MovimientoCredito[]): VentaCredito[] {
    const ordenadas = [...ventas].sort((a, b) =>
      new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );
    let saldo = abonos.reduce((sum, a) => sum + Number(a.monto), 0);
    return ordenadas.map(v => {
      const total = Number(v.total);
      if (saldo >= total) {
        saldo -= total;
        return { ...v, liquidado: true };
      }
      return { ...v, liquidado: false };
    });
  }

  cargarCuentas() {
    this.cargando.set(true);
    this.creditosService.getCuentas().subscribe({
      next: (data) => {
        const sorted = [...data].sort((a, b) => {
          if (!a.ultimo_pago && !b.ultimo_pago) return 0;
          if (!a.ultimo_pago) return 1;
          if (!b.ultimo_pago) return -1;
          return b.ultimo_pago.localeCompare(a.ultimo_pago);
        });
        this.cuentas.set(sorted);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  // ── CRUD ───────────────────────────────────────────
  guardarNuevoCliente() {
    if (!this.formCliente.nombre.trim()) {
      this.snackBar.open('El nombre es requerido', '', { duration: 2000 });
      return;
    }
    this.cargando.set(true);
    this.creditosService.crearCliente(this.buildPayload()).subscribe({
      next: () => {
        this.snackBar.open('Cliente creado correctamente', '', { duration: 3000 });
        this.cargando.set(false);
        this.cargarClientes();
        this.setVista('estado_cuenta');
      },
      error: (err) => {
        this.cargando.set(false);
        this.snackBar.open(err?.error?.nombre?.[0] || 'Error al crear cliente', '', { duration: 3000 });
      },
    });
  }

  guardarCambiosCliente() {
    const cliente = this.clienteActual();
    if (!cliente || !this.formCliente.nombre.trim()) {
      this.snackBar.open('El nombre es requerido', '', { duration: 2000 });
      return;
    }
    this.cargando.set(true);
    this.creditosService.modificarCliente(cliente.id, this.buildPayload()).subscribe({
      next: () => {
        this.snackBar.open('Cliente actualizado', '', { duration: 3000 });
        this.cargando.set(false);
        this.cargarClientes();
        this.subvistaModificar.set('seleccion');
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('Error al actualizar cliente', '', { duration: 3000 });
      },
    });
  }

  eliminarCliente() {
    const cliente = this.clienteActual();
    if (!cliente) return;
    this.cargando.set(true);
    this.creditosService.eliminarCliente(cliente.id).subscribe({
      next: () => {
        this.snackBar.open('Cliente eliminado', '', { duration: 3000 });
        this.cargando.set(false);
        this.cargarClientes();
        this.clienteActual.set(null);
        this.subvistaEliminar.set('seleccion');
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('Error al eliminar cliente', '', { duration: 3000 });
      },
    });
  }

  private buildPayload(): Record<string, unknown> {
    return {
      nombre: this.formCliente.nombre.trim(),
      direccion: this.formCliente.direccion.trim(),
      telefono: this.formCliente.telefono.trim(),
      credito_ilimitado: this.formCliente.limiteCredito === 0,
      credito_maximo: this.formCliente.limiteCredito > 0 ? this.formCliente.limiteCredito : null,
    };
  }

  private resetForm() {
    this.formCliente = { nombre: '', direccion: '', telefono: '', limiteCredito: 0 };
  }

  // ── Abonos ─────────────────────────────────────────
  abrirAbonar() {
    this.montoAbono = null;
    this.dialogAbonar = true;
  }

  registrarAbono() {
    const cuenta = this.cuentaActual();
    if (!cuenta || !this.montoAbono || this.montoAbono <= 0) return;
    this.cargandoDialog = true;
    this.creditosService.abonar(cuenta.id, this.montoAbono).subscribe({
      next: (actualizada) => {
        this.cuentaActual.set(actualizada);
        this.dialogAbonar = false;
        this.cargandoDialog = false;
        this.montoAbono = null;
        this.snackBar.open('Abono registrado correctamente', '', { duration: 3000 });
      },
      error: (err) => {
        this.cargandoDialog = false;
        this.snackBar.open(err?.error?.error || 'Error al registrar abono', '', { duration: 3000 });
      },
    });
  }

  liquidarAdeudo() {
    const cuenta = this.cuentaActual();
    if (!cuenta) return;
    const monto = this.saldoMostrado();
    if (monto <= 0) return;
    this.cargandoDialog = true;
    this.creditosService.abonar(cuenta.id, monto).subscribe({
      next: (actualizada) => {
        this.cuentaActual.set(actualizada);
        this.dialogLiquidar = false;
        this.cargandoDialog = false;
        this.snackBar.open('Adeudo liquidado completamente', '', { duration: 3000 });
      },
      error: (err) => {
        this.cargandoDialog = false;
        this.snackBar.open(err?.error?.error || 'Error al liquidar', '', { duration: 3000 });
      },
    });
  }

  abrirDetalleAbonos() {
    const cuenta = this.cuentaActual();
    if (!cuenta) return;
    this.dialogAbonos = true;
    this.abonosHistorial.set([]);
    this.creditosService.getAbonos(cuenta.id).subscribe({
      next: (data) => this.abonosHistorial.set(data),
      error: () => {},
    });
  }

  // ── Imprimir ───────────────────────────────────────
  imprimirEstado() {
    const cliente = this.clienteActual();
    if (!cliente) return;
    const noLiquidadas = this.ventasCredito().filter(v => !v.liquidado);
    const html = this.generarHTMLEstadoCuenta(
      cliente, this.cuentaActual(), noLiquidadas, [], false, !!cliente.precio_especial
    );
    this.impresionService.imprimirDocumento(html);
  }

  imprimirEstadoCompleto() {
    const cliente = this.clienteActual();
    if (!cliente) return;
    const html = this.generarHTMLEstadoCuenta(
      cliente, this.cuentaActual(), this.ventasCredito(), this.abonosCliente(), true, !!cliente.precio_especial
    );
    this.impresionService.imprimirDocumento(html);
  }

  imprimirReporte() { window.print(); }

  private formatCLP(n: number): string {
    return '$' + Math.round(n).toLocaleString('es-CL');
  }

  private formatFechaHeader(d: Date): string {
    const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const dia  = String(d.getDate()).padStart(2, '0');
    const mes  = MESES[d.getMonth()];
    const anio = d.getFullYear();
    let   h    = d.getHours();
    const min  = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${dia}/${mes}/${anio} ${String(h).padStart(2,'0')}:${min} ${ampm}`;
  }

  private formatFechaCorta(d: Date): string {
    const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const dia  = String(d.getDate()).padStart(2, '0');
    const mes  = MESES[d.getMonth()];
    const anio = String(d.getFullYear()).slice(2);
    return `${dia}/${mes}/${anio}`;
  }

  private generarHTMLEstadoCuenta(
    cliente: ClienteCredito,
    cuenta: CuentaCredito | null,
    ventas: VentaCredito[],
    abonos: MovimientoCredito[],
    completo: boolean,
    precioEspecial = false,
  ): string {
    const es58 = this.impresionService.anchoPapel === '58';
    const anchoMM   = es58 ? '58mm' : '80mm';
    const anchoBody = es58 ? '50mm' : '72mm';
    const fontSize  = es58 ? '9px'  : '10px';
    const sep       = '-'.repeat(es58 ? 28 : 36);
    const ahora     = new Date();
    const saldoPendiente = precioEspecial
      ? ventas.filter(v => !v.liquidado).reduce((sum, v) => sum + this.totalEspecialVenta(v), 0)
      : (cuenta ? Number(cuenta.saldo_usado) : Number(cliente.saldo_usado ?? 0));

    // Construir líneas de transacciones
    type Tx = { fecha: Date; etiqueta: string; monto: number };
    const txs: Tx[] = [];

    if (completo) {
      // Ventas (cargos) + abonos mezclados por fecha ASC
      for (const v of ventas) {
        const monto = precioEspecial ? this.totalEspecialVenta(v) : Number(v.total);
        txs.push({ fecha: new Date(v.fecha), etiqueta: 'COMPRAS+', monto });
      }
      for (const a of abonos) {
        txs.push({ fecha: new Date(a.fecha), etiqueta: 'ABONO-  ', monto: Number(a.monto) });
      }
      txs.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    } else {
      // Solo ventas no liquidadas
      for (const v of ventas) {
        const monto = precioEspecial ? this.totalEspecialVenta(v) : Number(v.total);
        txs.push({ fecha: new Date(v.fecha), etiqueta: 'COMPRAS+', monto });
      }
      txs.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    }

    const filasTx = txs.map(tx => {
      const fecha  = this.formatFechaCorta(tx.fecha);
      const monto  = this.formatCLP(tx.monto);
      return `<div class="tx-row">
        <span class="tx-fecha">${fecha}</span>
        <span class="tx-tipo">${tx.etiqueta}</span>
        <span class="tx-monto">${monto}</span>
      </div>`;
    }).join('');

    const cuerpo = txs.length > 0 ? filasTx
      : `<div class="tx-row"><span class="tx-vacio">(Sin movimientos)</span></div>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${anchoMM}">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: ${anchoBody};
    margin: 0 auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    line-height: 1.4;
    color: #000;
  }
  @page { size: ${anchoMM} auto; margin: 4mm 2mm; }
  body { padding: 2mm 0; }
  .centro  { text-align: center; }
  .negrita { font-weight: bold; }
  .sep     { margin: 3px 0; }
  .saldo-row {
    display: flex;
    justify-content: space-between;
    font-weight: bold;
    margin: 2px 0;
  }
  .tx-row {
    display: flex;
    align-items: baseline;
    margin: 2px 0;
  }
  .tx-fecha { min-width: 7em; }
  .tx-tipo  { flex: 1; }
  .tx-monto { text-align: right; white-space: nowrap; font-weight: bold; }
  .tx-vacio { color: #555; font-style: italic; }
</style>
</head>
<body>
  <div class="centro negrita">FERRETERIA VICTORIA</div>
  <div class="centro">OLGA VILLANUEVA 2386 · VILLA ALEMANA</div>
  <div class="sep">${sep}</div>
  <div class="centro">ESTADO DE CUENTA</div>
  <div class="centro negrita">* ${cliente.nombre.toUpperCase()} *</div>
  <div class="centro">AL ${this.formatFechaHeader(ahora)}</div>
  <div class="sep">${sep}</div>
  <div class="saldo-row"><span>SALDO ANTERIOR:</span><span>$0</span></div>
  <div class="sep">${sep}</div>
  ${cuerpo}
  <div class="sep">${sep}</div>
  <div class="saldo-row"><span>SALDO PENDIENTE:</span><span>${this.formatCLP(saldoPendiente)}</span></div>
  <div class="sep">${sep}</div>
  <div class="centro">FERRETERIA VICTORIA</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
  }

  // ── Selección múltiple ─────────────────────────────
  toggleTicket(id: number, event: MatCheckboxChange): void {
    const set = new Set(this.ticketsSeleccionados());
    event.checked ? set.add(id) : set.delete(id);
    this.ticketsSeleccionados.set(set);
  }

  toggleTodos(): void {
    if (this.todosSeleccionados()) {
      this.ticketsSeleccionados.set(new Set());
    } else {
      this.ticketsSeleccionados.set(new Set(this.ventasFiltradas().map(v => v.id)));
    }
  }

  deseleccionarTodo(): void {
    this.ticketsSeleccionados.set(new Set());
  }

  cambiarFiltroVentas(valor: string): void {
    this.filtroVentas.set(valor as 'todas' | 'no_liquidadas' | 'liquidadas');
    this.deseleccionarTodo();
  }

  // ── Impresión de tickets individuales / múltiples ──
  imprimirTicketIndividual(venta: VentaCredito, modo: ModoImpresionCredito): void {
    this.impresionService.imprimirTicketsCredito([this.adaptarVentaParaImpresion(venta)], modo);
  }

  imprimirSeleccionados(modo: ModoImpresionCredito): void {
    const ids = this.ticketsSeleccionados();
    const ventas = this.ventasCredito()
      .filter(v => ids.has(v.id))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    this.impresionService.imprimirMultiplesTicketsCredito(
      ventas.map(v => this.adaptarVentaParaImpresion(v)),
      this.clienteActual()?.nombre ?? '',
      modo
    );
  }

  private adaptarVentaParaImpresion(venta: VentaCredito): DatosTicketCredito {
    return {
      numero: venta.numero,
      fecha: venta.fecha,
      items: venta.items.map(i => ({
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio_unitario),
        precio_costo: Number(i.precio_costo ?? 0),
        subtotal: Number(i.subtotal),
      })),
      total: Number(venta.total),
    };
  }

  // ── Cargar precios costo ────────────────────────────
  abrirDialogCostos() {
    const items = this.itemsSinCostoVentaSeleccionada();
    this.productosSinCostoLista.set(items.map(i => ({
      id: i.producto_id!,
      nombre: i.descripcion,
      precio_venta_ref: Number(i.precio_unitario),
    })));
    this.costosNuevos = {};
    this.dialogCostos = true;
  }

  guardarPrecios() {
    const ids = Object.keys(this.costosNuevos)
      .map(Number)
      .filter(id => this.costosNuevos[id] > 0);
    if (ids.length === 0) { this.dialogCostos = false; return; }
    this.guardandoCostos = true;
    const peticiones = ids.map(id =>
      this.productosService.actualizar(id, { precio_costo: this.costosNuevos[id] })
    );
    forkJoin(peticiones).subscribe({
      next: () => {
        this.dialogCostos = false;
        this.guardandoCostos = false;
        this.snackBar.open('Precios costo guardados', '', { duration: 3000 });
        const cliente = this.clienteActual();
        if (cliente?.cuenta_id) this.cargarVentasCliente(cliente.cuenta_id);
      },
      error: () => {
        this.guardandoCostos = false;
        this.snackBar.open('Error al guardar precios', '', { duration: 3000 });
      },
    });
  }

  // ── Helpers ────────────────────────────────────────
  limiteDisplay(ilimitado: boolean, maximo: number | null): string {
    return ilimitado ? 'Sin Límite' : `$ ${Number(maximo ?? 0).toLocaleString('es-MX')}`;
  }

  irAEstadoCuenta(cuenta: CuentaCredito) {
    const cliente = this.clientes().find(c => c.id === cuenta.cliente_id);
    if (!cliente) return;
    this.clienteSeleccionado.set(cliente);
    this.clienteActual.set(cliente);
    this.cuentaActual.set(cuenta);
    this.ventaSeleccionada.set(null);
    this.ventasCredito.set([]);
    this.abonosCliente.set([]);
    this.ticketsSeleccionados.set(new Set());
    if (cliente.cuenta_id) this.cargarVentasCliente(cliente.cuenta_id);
    this.subvistaEstado.set('detalle');
    this.vista.set('estado_cuenta');
  }

  focusAll(el: HTMLInputElement) { el.select(); }
}
