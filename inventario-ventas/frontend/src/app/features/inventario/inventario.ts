import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { nextSort, sortArr, sortIcon, isActive, SortState, SORT_NONE } from '../../core/utils/sort';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { BuscadorProductosComponent } from '../../shared/components/buscador-productos/buscador-productos';
import { ProductosService, ProductoDetalle, Categoria } from '../../core/services/productos';
import {
  InventarioService,
  StockCritico,
  MovimientoInventario,
  KardexResponse,
  KardexMovimiento,
} from '../../core/services/inventario';

type Vista = 'ajuste' | 'stock_bajo' | 'reporte' | 'movimientos' | 'kardex';

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatSelectModule, MatSnackBarModule, MatProgressSpinnerModule,
    MatDialogModule, MatTooltipModule,
    NavbarComponent,
  ],
  templateUrl: './inventario.html',
  styleUrl: './inventario.scss',
})
export class InventarioComponent implements OnInit {
  private inventarioService = inject(InventarioService);
  private productosService = inject(ProductosService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  vista = signal<Vista>('ajuste');
  cargando = signal(false);
  productoSeleccionado = signal<ProductoDetalle | null>(null);
  stockCritico = signal<StockCritico | null>(null);
  productosReporte = signal<ProductoDetalle[]>([]);
  filtroReporte = signal('');
  filtroCategoria = signal<number | ''>('');
  categorias = signal<Categoria[]>([]);
  movimientos = signal<MovimientoInventario[]>([]);
  kardex = signal<KardexResponse | null>(null);

  readonly Number = Number;

  // Form fields
  codigoInput = '';
  deltaCantidad: number | null = null;
  nuevaCantidad: number | null = null;
  motivo = '';
  filtroFecha = new Date().toISOString().split('T')[0];
  filtroTipo = '';
  busquedaMov = '';
  kardexDesde = '';
  kardexHasta = '';
  busquedaKardex = signal('');

  // ── Ordenamiento ──────────────────────────────────
  ordenReporte    = signal<SortState>(SORT_NONE);
  ordenMovimientos = signal<SortState>(SORT_NONE);
  ordenKardex     = signal<SortState>(SORT_NONE);

  // Expose helpers to template
  readonly sortIcon = sortIcon;
  readonly isActive = isActive;

  // Reporte row selection
  productoReporteSeleccionado: ProductoDetalle | null = null;
  // Movimientos row selection
  movimientoSeleccionado: MovimientoInventario | null = null;

  navItems: { label: string; vista: Vista; icono: string }[] = [
    { label: 'Ajuste de Stock',        vista: 'ajuste',      icono: 'tune' },
    { label: 'Stock Crítico',          vista: 'stock_bajo',  icono: 'warning' },
    { label: 'Reporte de Inventario',  vista: 'reporte',     icono: 'inventory' },
    { label: 'Movimientos',            vista: 'movimientos', icono: 'swap_vert' },
    { label: 'Kardex',                 vista: 'kardex',      icono: 'receipt_long' },
  ];

  soloSinCosto = signal(false);

  conteoSinCosto = computed(() =>
    this.productosReporte().filter(p => Number(p.precio_costo) === 0).length
  );

  productosFiltrados = computed(() => {
    let list = this.productosReporte();
    const cat = this.filtroCategoria();
    const q = this.filtroReporte().toLowerCase();
    if (this.soloSinCosto()) list = list.filter(p => Number(p.precio_costo) === 0);
    if (cat !== '') list = list.filter(p => p.categoria === cat);
    if (q) list = list.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.codigo ?? '').toLowerCase().includes(q) ||
      (p.categoria_nombre ?? '').toLowerCase().includes(q)
    );
    return sortArr(list, this.ordenReporte());
  });

  movimientosFiltrados = computed(() =>
    sortArr(this.movimientos(), this.ordenMovimientos())
  );

  kardexFiltrado = computed(() => {
    const k = this.kardex();
    if (!k) return [];
    const q = this.busquedaKardex().toLowerCase().trim();
    const filtrado = !q ? k.movimientos : k.movimientos.filter(m =>
      m.tipo_display.toLowerCase().includes(q) ||
      (m.motivo ?? '').toLowerCase().includes(q) ||
      (m.usuario ?? '').toLowerCase().includes(q)
    );
    return sortArr(filtrado, this.ordenKardex());
  });

  ordenarReporte(col: string): void    { this.ordenReporte.set(nextSort(this.ordenReporte(), col)); }
  ordenarMovimientos(col: string): void { this.ordenMovimientos.set(nextSort(this.ordenMovimientos(), col)); }
  ordenarKardex(col: string): void     { this.ordenKardex.set(nextSort(this.ordenKardex(), col)); }

  costoTotalInventario = computed(() =>
    this.productosReporte().reduce(
      (sum, p) => sum + Number(p.inventario_actual) * Number(p.precio_costo), 0
    )
  );

  cantidadTotalInventario = computed(() =>
    this.productosReporte().reduce((sum, p) => sum + Number(p.inventario_actual), 0)
  );

  ngOnInit() {
    this.cargarStockCritico();
    this.productosService.getCategorias().subscribe({
      next: (data) => this.categorias.set(data),
      error: () => {},
    });
  }

  setVista(v: Vista) {
    this.vista.set(v);
    if (v === 'ajuste' || v === 'kardex') {
      this.productoSeleccionado.set(null);
      this.resetAjuste();
    }
    if (v !== 'reporte')     { this.soloSinCosto.set(false); this.ordenReporte.set(SORT_NONE); }
    if (v !== 'movimientos')   this.ordenMovimientos.set(SORT_NONE);
    if (v !== 'kardex')      { this.busquedaKardex.set(''); this.ordenKardex.set(SORT_NONE); }
    if (v === 'stock_bajo') this.cargarStockCritico();
    if (v === 'reporte') this.cargarReporte();
    if (v === 'movimientos') this.cargarMovimientos();
  }

  resetAjuste() {
    this.codigoInput = '';
    this.deltaCantidad = null;
    this.nuevaCantidad = null;
    this.motivo = '';
    this.kardex.set(null);
  }

  // ── Búsqueda de producto (ajuste / kardex) ─────────

  buscarPorCodigo() {
    const codigo = this.codigoInput.trim();
    if (!codigo) { this.abrirBuscador(); return; }
    this.productosService.buscarPorCodigo(codigo).subscribe({
      next: (resultados) => {
        if (resultados.length === 0) {
          this.snackBar.open(`Código "${codigo}" no encontrado`, '', { duration: 2500 });
          return;
        }
        const prod = resultados[0];
        if (this.vista() === 'ajuste' && prod.tipo === 'kit') {
          this.snackBar.open(
            'Los kits no tienen inventario propio. Ajusta el stock de sus componentes.',
            '', { duration: 4000 }
          );
          return;
        }
        this.seleccionarProducto(prod);
      },
      error: () => this.snackBar.open('Error al buscar producto', '', { duration: 2000 }),
    });
  }

  abrirBuscador() {
    const ref = this.dialog.open(BuscadorProductosComponent, {
      width: '820px',
      data: {},
    });
    ref.afterClosed().subscribe((prod: ProductoDetalle | null) => {
      if (!prod) return;
      if (this.vista() === 'ajuste' && prod.tipo === 'kit') {
        this.snackBar.open(
          'Los kits no tienen inventario propio. Ajusta el stock de sus componentes.',
          '', { duration: 4000 }
        );
        return;
      }
      this.seleccionarProducto(prod);
    });
  }

  private seleccionarProducto(prod: ProductoDetalle) {
    this.productoSeleccionado.set(prod);
    this.codigoInput = prod.codigo;
    this.deltaCantidad = null;
    this.nuevaCantidad = null;
    this.motivo = '';
    if (this.vista() === 'kardex') {
      this.kardex.set(null);
      this.cargarKardex();
    }
  }

  // ── Sincronización +/- ↔ Nueva Cantidad ──────────

  onDeltaChange() {
    const prod = this.productoSeleccionado();
    if (!prod || this.deltaCantidad === null) { this.nuevaCantidad = null; return; }
    this.nuevaCantidad = Number(prod.inventario_actual) + this.deltaCantidad;
  }

  onNuevaCantidadChange() {
    const prod = this.productoSeleccionado();
    if (!prod || this.nuevaCantidad === null) { this.deltaCantidad = null; return; }
    this.deltaCantidad = this.nuevaCantidad - Number(prod.inventario_actual);
  }

  // ── Guardar ajuste ────────────────────────────────

  guardarAjuste() {
    const prod = this.productoSeleccionado();
    if (!prod || this.nuevaCantidad === null || this.nuevaCantidad < 0) {
      this.snackBar.open('Ingresa una cantidad válida', '', { duration: 2000 });
      return;
    }
    const tipoMovimiento = (this.deltaCantidad ?? 0) >= 0 ? 'entrada' : 'ajuste';
    this.cargando.set(true);
    this.inventarioService.ajustarInventario(prod.id, {
      nueva_cantidad: this.nuevaCantidad,
      tipo: tipoMovimiento,
      motivo: this.motivo.trim() || 'Ajuste de inventario',
    }).subscribe({
      next: (res) => {
        this.productoSeleccionado.set(res);
        this.deltaCantidad = null;
        this.nuevaCantidad = null;
        this.motivo = '';
        this.cargando.set(false);
        this.snackBar.open(`Stock ajustado a ${res.inventario_actual}`, '', { duration: 3000 });
        this.cargarStockCritico();
      },
      error: (err) => {
        this.cargando.set(false);
        this.snackBar.open(err?.error?.error || 'Error al ajustar inventario', '', { duration: 3000 });
      },
    });
  }

  // ── Carga de datos ────────────────────────────────

  cargarStockCritico() {
    this.inventarioService.getStockCritico().subscribe({
      next: (data) => this.stockCritico.set(data),
      error: () => {},
    });
  }

  cargarReporte() {
    this.cargando.set(true);
    this.productoReporteSeleccionado = null;
    this.productosService.listar().subscribe({
      next: (data) => {
        this.productosReporte.set(data);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  cargarMovimientos() {
    this.cargando.set(true);
    this.movimientoSeleccionado = null;
    this.inventarioService.getMovimientos({
      fecha: this.filtroFecha || undefined,
      tipo: this.filtroTipo || undefined,
      search: this.busquedaMov || undefined,
    }).subscribe({
      next: (data) => {
        this.movimientos.set(data);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  cargarKardex() {
    const prod = this.productoSeleccionado();
    if (!prod) return;
    this.cargando.set(true);
    this.inventarioService.getKardex(prod.id, {
      desde: this.kardexDesde || undefined,
      hasta: this.kardexHasta || undefined,
    }).subscribe({
      next: (data) => {
        this.kardex.set(data);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  // ── Navegación ────────────────────────────────────

  navegarAModificar() {
    if (!this.productoReporteSeleccionado) return;
    this.router.navigate(['/productos'], {
      queryParams: { editar: this.productoReporteSeleccionado.id },
    });
  }

  imprimirMovimientos() {
    window.print();
  }

  // ── Helpers de movimientos ────────────────────────

  esSalidaMov(m: { stock_antes: number; stock_despues: number }): boolean {
    return Number(m.stock_despues) < Number(m.stock_antes);
  }

  cantidadConSigno(m: { stock_antes: number; stock_despues: number; cantidad: number }): string {
    return this.esSalidaMov(m) ? `-${m.cantidad}` : `+${m.cantidad}`;
  }

  cantidadClase(m: { stock_antes: number; stock_despues: number }): string {
    return this.esSalidaMov(m) ? 'mov-salida' : 'mov-entrada';
  }

  tipoDisplayMov(m: MovimientoInventario): { label: string; clase: string } {
    const salida = this.esSalidaMov(m);
    return {
      label: salida ? 'SALIDA' : 'ENTRADA',
      clase: salida ? 'badge-salida' : 'badge-entrada',
    };
  }

  referenciaMovimiento(m: MovimientoInventario): string {
    if (m.tipo === 'venta') return m.referencia_venta ? `Venta #${m.referencia_venta}` : 'Venta';
    if (m.tipo === 'devolucion') return 'Devolución';
    if (m.tipo === 'entrada') return m.motivo || 'Entrada de mercadería';
    return m.motivo || 'Ajuste manual';
  }

  // ── Helpers generales ─────────────────────────────

  colorStock(p: { inventario_actual: number; inventario_minimo: number }): string {
    if (Number(p.inventario_actual) <= 0) return 'stock-rojo';
    if (Number(p.inventario_actual) <= Number(p.inventario_minimo)) return 'stock-naranja';
    return 'stock-verde';
  }

  tipoBadge(tipo: string): string {
    if (tipo === 'entrada' || tipo === 'devolucion') return 'badge-entrada';
    if (tipo === 'venta' || tipo === 'salida') return 'badge-salida';
    return 'badge-ajuste';
  }
}
