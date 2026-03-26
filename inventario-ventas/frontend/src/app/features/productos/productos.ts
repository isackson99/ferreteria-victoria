import {
  Component, OnInit, OnDestroy, HostListener, ViewChild,
  ElementRef, signal, computed, inject, Inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, catchError, firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { BuscadorProductosComponent } from '../../shared/components/buscador-productos/buscador-productos';
import { ImportarDialogComponent } from './importar-dialog/importar-dialog';
import { ProductosService, ProductoDetalle, Categoria, KitComponenteUI } from '../../core/services/productos';
import { VentasService } from '../../core/services/ventas';
import { nextSort, sortArr, sortIcon, isActive, SortState, SORT_NONE } from '../../core/utils/sort';

// ─── Inline confirmation dialog ────────────────────────────────────────────────
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.titulo }}</h2>
    <mat-dialog-content><p>{{ data.mensaje }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="warn" [mat-dialog-close]="true">
        {{ data.confirmLabel || 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `
})
export class ConfirmDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { titulo: string; mensaje: string; confirmLabel?: string }) {}
}

// ─── Main component ─────────────────────────────────────────────────────────────
type Vista = 'nuevo' | 'modificar' | 'eliminar' | 'departamentos' | 'catalogo';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    NavbarComponent,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatSelectModule, MatCheckboxModule, MatRadioModule,
    MatTableModule, MatPaginatorModule,
    MatSnackBarModule, MatDialogModule, MatProgressSpinnerModule,
    MatTooltipModule, MatDividerModule,
  ],
  templateUrl: './productos.html',
  styleUrl: './productos.scss',
})
export class ProductosComponent implements OnInit, OnDestroy {
  @ViewChild('codigoModInput') codigoModInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('codigoElimInput') codigoElimInputRef!: ElementRef<HTMLInputElement>;

  // ── Vista ────────────────────────────────────────────────────────────────────
  vistaActual = signal<Vista>('catalogo');

  // ── Form (Nuevo / Modificar) ─────────────────────────────────────────────────
  form!: FormGroup;
  modoEdicion = false;
  productoEditandoId: number | null = null;
  codigoExiste    = signal(false);
  verificandoCodigo = signal(false);
  cargando        = signal(false);
  categorias      = signal<Categoria[]>([]);

  // ── Kit Manager ───────────────────────────────────────────────────────────────
  kitComponentes = signal<KitComponenteUI[]>([]);

  // ── Modificar / Eliminar ─────────────────────────────────────────────────────
  codigoBusquedaMod  = '';
  codigoBusquedaElim = '';
  productoEncontrado = signal<ProductoDetalle | null>(null);

  // ── Departamentos ─────────────────────────────────────────────────────────────
  listaDepts         = signal<Categoria[]>([]);
  deptsFiltrados     = signal<Categoria[]>([]);
  deptBuscador       = '';
  deptSeleccionado   = signal<Categoria | null>(null);
  modoDeptNuevo      = false;
  formDept!: FormGroup;
  cargandoDept       = signal(false);

  // ── Catálogo ─────────────────────────────────────────────────────────────────
  readonly Number = Number;
  readonly sortIcon = sortIcon;
  readonly isActive = isActive;

  ordenCatalogo = signal<SortState>(SORT_NONE);

  catalogoTodos      = signal<ProductoDetalle[]>([]);
  catalogoFiltrado   = signal<ProductoDetalle[]>([]);
  catalogoVisible    = signal<ProductoDetalle[]>([]);
  catalogoBuscador   = '';
  catalogoCategoria  = '';
  catalogoPage       = 0;
  catalogoPageSize   = 50;
  soloSinCosto       = signal(false);

  conteoSinCosto = computed(() =>
    this.catalogoTodos().filter(p => Number(p.precio_costo) === 0).length
  );
  seleccionados      = new Set<number>();
  cargandoCatalogo   = signal(false);
  columnasCatalogo   = [
    'sel', 'codigo', 'nombre', 'categoria', 'precio_costo',
    'precio_venta', 'precio_mayoreo', 'inventario_actual',
    'inventario_minimo', 'inventario_maximo', 'tipo'
  ];

  private destroy$      = new Subject<void>();
  private codigoSubject = new Subject<string>();

  private fb              = inject(FormBuilder);
  private productosService = inject(ProductosService);
  private ventasService   = inject(VentasService);
  private snackBar        = inject(MatSnackBar);
  private dialog          = inject(MatDialog);

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit() {
    this.buildForm();
    this.buildFormDept();
    this.cargarCategorias();
    this.cargarCatalogo();

    // Código uniqueness check
    this.codigoSubject.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(cod => {
        if (!cod) { this.codigoExiste.set(false); this.verificandoCodigo.set(false); return of([]); }
        this.verificandoCodigo.set(true);
        return this.productosService.buscarPorCodigo(cod).pipe(catchError(() => of([])));
      }),
      takeUntil(this.destroy$)
    ).subscribe((res: ProductoDetalle[]) => {
      const yaExiste  = res.length > 0;
      const mismoId   = this.modoEdicion && res.some(p => p.id === this.productoEditandoId);
      this.codigoExiste.set(yaExiste && !mismoId);
      this.verificandoCodigo.set(false);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    const vista = this.vistaActual();
    if (event.key === 'F10' && (vista === 'modificar' || vista === 'eliminar')) {
      event.preventDefault();
      this.abrirBuscador();
    }
  }

  // ─── Vista ────────────────────────────────────────────────────────────────────

  setVista(v: Vista) {
    this.vistaActual.set(v);
    this.productoEncontrado.set(null);
    this.codigoBusquedaMod  = '';
    this.codigoBusquedaElim = '';
    if (v === 'nuevo')   this.iniciarNuevo();
    if (v === 'departamentos') this.cargarDepts();
    if (v === 'catalogo') this.cargarCatalogo();
  }

  // ─── Form ─────────────────────────────────────────────────────────────────────

  buildForm(p?: ProductoDetalle) {
    this.form = this.fb.group({
      codigo:             [p?.codigo              ?? '', [Validators.required, Validators.maxLength(50)]],
      nombre:             [p?.nombre              ?? '', [Validators.required, Validators.maxLength(200)]],
      tipo:               [p?.tipo                ?? 'unidad', Validators.required],
      precio_costo:       [p?.precio_costo        ?? 0,    [Validators.min(0)]],
      porcentaje_ganancia:[p?.porcentaje_ganancia ?? null, [Validators.min(0), Validators.max(1000)]],
      precio_venta:       [p?.precio_venta        ?? 0,    [Validators.required, Validators.min(0.01)]],
      precio_mayoreo:     [p?.precio_mayoreo      ?? null, [Validators.min(0)]],
      mayoreo_minimo:     [p?.mayoreo_minimo      ?? null, [Validators.min(1)]],
      categoria:          [p?.categoria           ?? null],
      usa_inventario:     [p?.usa_inventario      ?? true],
      inventario_actual:  [p?.inventario_actual   ?? 0,    [Validators.min(0)]],
      inventario_minimo:  [p?.inventario_minimo   ?? 0,    [Validators.min(0)]],
      inventario_maximo:  [p?.inventario_maximo   ?? 0,    [Validators.min(0)]],
    });
    this.kitComponentes.set([]);
    this.codigoExiste.set(false);
    this.verificandoCodigo.set(false);

    this.form.get('codigo')!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => {
      this.codigoSubject.next(val);
    });
  }

  iniciarNuevo() {
    this.modoEdicion         = false;
    this.productoEditandoId  = null;
    this.buildForm();
  }

  cargarEnFormulario(p: ProductoDetalle) {
    this.modoEdicion        = true;
    this.productoEditandoId = p.id;
    console.log('[kit-diag] cargarEnFormulario tipo:', p.tipo, 'kit_componentes:', JSON.stringify(p.kit_componentes));
    this.buildForm(p);
    this.productoEncontrado.set(p);
    if (p.tipo === 'kit' && p.kit_componentes?.length) {
      this.kitComponentes.set(p.kit_componentes.map(kc => ({ ...kc })));
    }
  }

  recalcularPrecio() {
    const costo = parseFloat(this.form.get('precio_costo')!.value) || 0;
    const pct   = parseFloat(this.form.get('porcentaje_ganancia')!.value);
    if (costo > 0 && !isNaN(pct)) {
      const pv = costo * (1 + pct / 100);
      this.form.get('precio_venta')!.setValue(pv.toFixed(2), { emitEvent: false });
    }
  }

  recalcularGanancia() {
    const pv = parseFloat(this.form.get('precio_venta')!.value) || 0;
    const pc = parseFloat(this.form.get('precio_costo')!.value) || 0;
    if (pc > 0 && pv > 0) {
      const pct = ((pv / pc) - 1) * 100;
      this.form.get('porcentaje_ganancia')!.setValue(pct.toFixed(2), { emitEvent: false });
    }
  }

  cancelarForm() {
    if (this.modoEdicion) {
      this.productoEncontrado.set(null);
      this.buildForm();
    } else {
      this.buildForm();
    }
  }

  // ─── Guardar ──────────────────────────────────────────────────────────────────

  guardar() {
    if (this.form.invalid || this.codigoExiste() || this.cargando()) return;
    const data = this.prepararDatos();
    this.cargando.set(true);

    if (this.modoEdicion && this.productoEditandoId) {
      this.productosService.actualizar(this.productoEditandoId, data).subscribe({
        next: prod => {
          this.snackBar.open('Producto actualizado correctamente', '', { duration: 3000 });
          this.cargando.set(false);
          this.verificarProductoEnTickets(prod);
          this.cargarCatalogo();
          this.productoEncontrado.set(null);
          this.buildForm();
          this.modoEdicion = false;
          this.productoEditandoId = null;
        },
        error: err => {
          this.mostrarError(err);
          this.cargando.set(false);
        }
      });
    } else {
      this.productosService.crear(data).subscribe({
        next: () => {
          this.snackBar.open('Producto creado correctamente', '', { duration: 3000 });
          this.cargando.set(false);
          this.buildForm();
          this.cargarCatalogo();
        },
        error: err => {
          this.mostrarError(err);
          this.cargando.set(false);
        }
      });
    }
  }

  private prepararDatos(): any {
    const v = this.form.value;
    console.log('[kit-diag] tipo:', v.tipo);
    console.log('[kit-diag] kitComponentes signal:', JSON.stringify(this.kitComponentes()));
    const data: any = {
      codigo:              v.codigo?.trim(),
      nombre:              v.nombre?.trim(),
      tipo:                v.tipo,
      precio_costo:        parseFloat(v.precio_costo) || 0,
      porcentaje_ganancia: v.porcentaje_ganancia ? parseFloat(v.porcentaje_ganancia) : null,
      precio_venta:        parseFloat(v.precio_venta) || 0,
      precio_mayoreo:      v.precio_mayoreo ? parseFloat(v.precio_mayoreo) : null,
      mayoreo_minimo:      v.mayoreo_minimo ? parseFloat(v.mayoreo_minimo) : null,
      categoria:           v.categoria || null,
      usa_inventario:      v.tipo === 'kit' ? false : v.usa_inventario,
    };
    if (v.tipo === 'kit') {
      data.componentes = this.kitComponentes().map(kc => ({
        componente: kc.componente,
        cantidad: kc.cantidad,
      }));
      console.log('[kit-diag] body a enviar:', JSON.stringify(data));
    } else if (v.usa_inventario) {
      data.inventario_actual  = parseFloat(v.inventario_actual) || 0;
      data.inventario_minimo  = parseFloat(v.inventario_minimo) || 0;
      data.inventario_maximo  = parseFloat(v.inventario_maximo) || 0;
    }
    return data;
  }

  // ─── Kit Manager ──────────────────────────────────────────────────────────────

  kitsPosibles(): number {
    const comps = this.kitComponentes();
    if (!comps.length) return 0;
    return Math.floor(
      Math.min(...comps.map(kc => kc.cantidad > 0 ? kc.stock_actual / kc.cantidad : 0))
    );
  }

  agregarComponenteKit() {
    const ref = this.dialog.open(BuscadorProductosComponent, {
      width: '860px',
      maxWidth: '95vw',
      data: {},
    });
    ref.afterClosed().subscribe((prod: ProductoDetalle | null) => {
      if (!prod) return;
      if (prod.tipo === 'kit') {
        this.snackBar.open('No se puede agregar un kit como componente', '', { duration: 2500 });
        return;
      }
      if (this.modoEdicion && prod.id === this.productoEditandoId) {
        this.snackBar.open('Un kit no puede contenerse a sí mismo', '', { duration: 2500 });
        return;
      }
      if (this.kitComponentes().some(kc => kc.componente === prod.id)) {
        this.snackBar.open('Este componente ya está en el kit', '', { duration: 2000 });
        return;
      }
      this.kitComponentes.update(list => [...list, {
        componente:        prod.id,
        componente_nombre: prod.nombre,
        componente_codigo: prod.codigo,
        cantidad:          1,
        stock_actual:      Number(prod.inventario_actual),
      }]);
    });
  }

  eliminarComponenteKit(idx: number) {
    this.kitComponentes.update(list => list.filter((_, i) => i !== idx));
  }

  editarCantidadKit(idx: number, val: string) {
    const cantidad = parseFloat(val);
    if (isNaN(cantidad) || cantidad <= 0) return;
    this.kitComponentes.update(list =>
      list.map((kc, i) => i === idx ? { ...kc, cantidad } : kc)
    );
  }

  // ─── Verificar si producto está en tickets abiertos (tras modificar) ──────────

  private async verificarProductoEnTickets(prod: ProductoDetalle) {
    try {
      const tickets = await firstValueFrom(this.ventasService.getTicketsAbiertos());
      const enCarrito = tickets.some(t => t.items.some(i => i.producto === prod.id));
      if (enCarrito) {
        this.snackBar.open(
          'Este producto está en el carrito activo. Los precios se han actualizado en tiempo real.',
          'OK', { duration: 5000 }
        );
        this.ventasService.notificarProductoActualizado$.next(prod.id);
      }
    } catch { /* silencioso */ }
  }

  // ─── Modificar ────────────────────────────────────────────────────────────────

  cargarPorCodigoMod() {
    const cod = this.codigoBusquedaMod.trim();
    if (!cod) return;
    this.cargando.set(true);
    this.productosService.buscarPorCodigo(cod).subscribe({
      next: res => {
        this.cargando.set(false);
        if (res.length > 0) {
          this.cargarEnFormulario(res[0]);
        } else {
          this.snackBar.open('Producto no encontrado', '', { duration: 2500 });
        }
      },
      error: () => this.cargando.set(false)
    });
  }

  // ─── Eliminar ─────────────────────────────────────────────────────────────────

  cargarPorCodigoElim() {
    const cod = this.codigoBusquedaElim.trim();
    if (!cod) return;
    this.cargando.set(true);
    this.productosService.buscarPorCodigo(cod).subscribe({
      next: res => {
        this.cargando.set(false);
        if (res.length > 0) {
          this.productoEncontrado.set(res[0]);
        } else {
          this.snackBar.open('Producto no encontrado', '', { duration: 2500 });
        }
      },
      error: () => this.cargando.set(false)
    });
  }

  async eliminarProducto() {
    const prod = this.productoEncontrado();
    if (!prod) return;

    let tickets: any[] = [];
    try { tickets = await firstValueFrom(this.ventasService.getTicketsAbiertos()); } catch {}

    const ticketsConProducto = tickets.filter((t: any) =>
      t.items.some((i: any) => i.producto === prod.id)
    );

    if (ticketsConProducto.length > 0) {
      const ref = this.dialog.open(ConfirmDialogComponent, {
        data: {
          titulo: 'Producto en carrito activo',
          mensaje: `Este producto está en el carrito activo en ${ticketsConProducto.length} ticket(s). ¿Desea que el sistema lo quite automáticamente del carrito antes de eliminar?`,
          confirmLabel: 'Quitar del carrito y eliminar'
        }
      });
      ref.afterClosed().subscribe(async confirmed => {
        if (!confirmed) return;
        for (const ticket of ticketsConProducto) {
          for (const item of ticket.items.filter((i: any) => i.producto === prod.id)) {
            try { await firstValueFrom(this.ventasService.quitarItem(ticket.id, item.id)); } catch {}
          }
        }
        this.ejecutarEliminar(prod);
      });
    } else {
      const ref = this.dialog.open(ConfirmDialogComponent, {
        data: {
          titulo: '¿Eliminar Producto?',
          mensaje: `¿Está seguro que desea eliminar "${prod.nombre}"? Esta acción no se puede deshacer.`,
          confirmLabel: 'Confirmar Eliminación'
        }
      });
      ref.afterClosed().subscribe(confirmed => {
        if (confirmed) this.ejecutarEliminar(prod);
      });
    }
  }

  private ejecutarEliminar(prod: ProductoDetalle) {
    this.cargando.set(true);
    this.productosService.eliminar(prod.id).subscribe({
      next: res => {
        this.cargando.set(false);
        this.productoEncontrado.set(null);
        this.codigoBusquedaElim = '';
        if (res?.desactivado) {
          this.snackBar.open(
            `Producto desactivado — tiene historial de ventas`,
            'OK',
            { duration: 5000, panelClass: 'snack-advertencia' }
          );
        } else {
          this.snackBar.open(`Producto "${prod.nombre}" eliminado correctamente`, '', { duration: 3000 });
        }
        this.setVista('catalogo');
        this.cargarCatalogo();
      },
      error: err => {
        this.mostrarError(err);
        this.cargando.set(false);
      }
    });
  }

  // ─── Importar Excel ──────────────────────────────────────────────────────────

  abrirImportar() {
    const ref = this.dialog.open(ImportarDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      disableClose: false,
    });
    ref.afterClosed().subscribe((importado: boolean) => {
      if (importado) this.cargarCatalogo();
    });
  }

  // ─── Buscador modal (F10) ────────────────────────────────────────────────────

  abrirBuscador() {
    const ref = this.dialog.open(BuscadorProductosComponent, {
      width: '860px',
      maxWidth: '95vw',
      data: {},
    });
    ref.afterClosed().subscribe((prod: ProductoDetalle | null) => {
      if (!prod) return;
      if (this.vistaActual() === 'modificar') {
        this.cargarEnFormulario(prod);
        this.codigoBusquedaMod = prod.codigo;
      } else if (this.vistaActual() === 'eliminar') {
        this.productoEncontrado.set(prod);
        this.codigoBusquedaElim = prod.codigo;
      }
    });
  }

  // ─── Categorías ───────────────────────────────────────────────────────────────

  cargarCategorias() {
    this.productosService.getCategorias().subscribe(cats => {
      this.categorias.set(cats);
      this.listaDepts.set(cats);
      this.deptsFiltrados.set(cats);
    });
  }

  // ─── Departamentos ────────────────────────────────────────────────────────────

  buildFormDept(cat?: Categoria) {
    this.formDept = this.fb.group({
      nombre:      [cat?.nombre      ?? '', [Validators.required, Validators.maxLength(100)]],
      descripcion: [cat?.descripcion ?? '',  [Validators.maxLength(300)]],
    });
  }

  cargarDepts() {
    this.cargandoDept.set(true);
    this.productosService.getCategorias().subscribe(cats => {
      this.listaDepts.set(cats);
      this.filtrarDepts();
      this.cargandoDept.set(false);
    });
  }

  filtrarDepts() {
    const q = this.deptBuscador.toLowerCase();
    this.deptsFiltrados.set(
      q ? this.listaDepts().filter(c => c.nombre.toLowerCase().includes(q)) : this.listaDepts()
    );
  }

  seleccionarDept(cat: Categoria) {
    this.deptSeleccionado.set(cat);
    this.modoDeptNuevo = false;
    this.buildFormDept(cat);
  }

  nuevoDept() {
    this.deptSeleccionado.set(null);
    this.modoDeptNuevo = true;
    this.buildFormDept();
  }

  guardarDept() {
    if (this.formDept.invalid) return;
    const data = this.formDept.value;
    this.cargandoDept.set(true);

    if (this.modoDeptNuevo) {
      this.productosService.crearCategoria(data).subscribe({
        next: () => { this.snackBar.open('Departamento creado', '', { duration: 2500 }); this.cargarDepts(); this.cargarCategorias(); this.modoDeptNuevo = false; this.cargandoDept.set(false); },
        error: () => this.cargandoDept.set(false)
      });
    } else {
      const sel = this.deptSeleccionado();
      if (!sel) return;
      this.productosService.actualizarCategoria(sel.id, data).subscribe({
        next: () => { this.snackBar.open('Departamento actualizado', '', { duration: 2500 }); this.cargarDepts(); this.cargarCategorias(); this.cargandoDept.set(false); },
        error: () => this.cargandoDept.set(false)
      });
    }
  }

  eliminarDept() {
    const sel = this.deptSeleccionado();
    if (!sel) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { titulo: '¿Eliminar Departamento?', mensaje: `¿Eliminar "${sel.nombre}"? Los productos de esta categoría quedarán sin departamento.`, confirmLabel: 'Eliminar' }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.productosService.eliminarCategoria(sel.id).subscribe({
        next: () => { this.snackBar.open('Departamento eliminado', '', { duration: 2500 }); this.deptSeleccionado.set(null); this.cargarDepts(); this.cargarCategorias(); },
        error: err => this.mostrarError(err)
      });
    });
  }

  cancelarDept() {
    this.deptSeleccionado.set(null);
    this.modoDeptNuevo = false;
    this.buildFormDept();
  }

  // ─── Catálogo ─────────────────────────────────────────────────────────────────

  cargarCatalogo() {
    this.cargandoCatalogo.set(true);
    this.productosService.listar().subscribe({
      next: prods => {
        this.catalogoTodos.set(prods);
        this.filtrarCatalogo();
        this.cargandoCatalogo.set(false);
      },
      error: () => this.cargandoCatalogo.set(false)
    });
  }

  filtrarCatalogo() {
    const q    = this.catalogoBuscador.toLowerCase();
    const catId = this.catalogoCategoria ? parseInt(this.catalogoCategoria, 10) : null;
    let res = this.catalogoTodos();
    if (this.soloSinCosto()) res = res.filter(p => Number(p.precio_costo) === 0);
    if (q) res = res.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.categoria_nombre ?? '').toLowerCase().includes(q)
    );
    if (catId) res = res.filter(p => p.categoria === catId);
    this.catalogoFiltrado.set(sortArr(res, this.ordenCatalogo()));
    this.catalogoPage = 0;
    this.actualizarPagina();
  }

  ordenarCatalogo(col: string) {
    this.ordenCatalogo.set(nextSort(this.ordenCatalogo(), col));
    this.catalogoFiltrado.set(sortArr(this.catalogoFiltrado(), this.ordenCatalogo()));
    this.actualizarPagina();
  }

  toggleSoloSinCosto() {
    this.soloSinCosto.update(v => !v);
    this.filtrarCatalogo();
  }

  actualizarPagina() {
    const start = this.catalogoPage * this.catalogoPageSize;
    this.catalogoVisible.set(this.catalogoFiltrado().slice(start, start + this.catalogoPageSize));
  }

  onPageChange(e: PageEvent) {
    this.catalogoPage     = e.pageIndex;
    this.catalogoPageSize = e.pageSize;
    this.actualizarPagina();
  }

  toggleSeleccion(id: number) {
    if (this.seleccionados.has(id)) this.seleccionados.delete(id);
    else this.seleccionados.add(id);
  }

  toggleTodos() {
    const visible = this.catalogoVisible();
    const todosSeleccionados = visible.every(p => this.seleccionados.has(p.id));
    visible.forEach(p => todosSeleccionados ? this.seleccionados.delete(p.id) : this.seleccionados.add(p.id));
  }

  todosSeleccionados(): boolean {
    return this.catalogoVisible().length > 0 && this.catalogoVisible().every(p => this.seleccionados.has(p.id));
  }

  irAModificarDesde(prod: ProductoDetalle) {
    this.setVista('modificar');
    setTimeout(() => this.cargarEnFormulario(prod), 50);
  }

  colorExistencia(p: ProductoDetalle): string {
    if (p.inventario_actual <= 0) return 'rojo';
    if (p.stock_bajo) return 'naranja';
    return '';
  }

  exportarCSV() {
    const prods = this.catalogoFiltrado();
    const headers = ['Código','Descripción','Departamento','Costo','P.Venta','P.Mayoreo','Existencia','Inv.Mínimo','Inv.Máximo','Tipo Venta'];
    const rows = prods.map(p => [
      p.codigo,
      `"${p.nombre.replace(/"/g, '""')}"`,
      p.categoria_nombre || '',
      p.precio_costo,
      p.precio_venta,
      p.precio_mayoreo ?? '',
      p.inventario_actual,
      p.inventario_minimo,
      p.inventario_maximo,
      p.tipo
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `catalogo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Utils ────────────────────────────────────────────────────────────────────

  private mostrarError(err: any) {
    const msg = err?.error ? JSON.stringify(err.error) : 'Error al procesar la solicitud';
    this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
  }

  tipoLabel(tipo: string): string {
    return tipo === 'unidad' ? 'Unidad' : tipo === 'granel' ? 'Granel' : 'Kit';
  }
}
