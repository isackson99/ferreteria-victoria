import { Component, Input, Output, EventEmitter, signal, computed, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { VentasService, Venta, Producto } from '../../../core/services/ventas';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

type SortDir = 'asc' | 'desc' | null;
type SortCol = 'nombre' | 'precio_venta' | 'categoria_nombre' | 'inventario_actual' | null;

@Component({
  selector: 'app-producto-search',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './producto-search.html',
  styleUrl: './producto-search.scss'
})
export class ProductoSearchComponent implements AfterViewInit {
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('resultadosContainer') containerRef!: ElementRef<HTMLElement>;

  @Input() ticketActivo: Venta | null = null;
  @Input() usarMayoreoExterno = false;
  @Input() modoDevolucion = false;

  @Output() itemAgregado = new EventEmitter<Venta>();
  @Output() productoAgregado = new EventEmitter<Producto>();
  @Output() granelSeleccionado = new EventEmitter<Producto>();
  @Output() devolucionSeleccionada = new EventEmitter<Producto>();

  query = signal('');
  resultados = signal<Producto[]>([]);
  cargando = signal(false);
  mostrarHint = signal(false);

  // Cursor de teclado: movido con flechas, auto-0 al llegar resultados
  activeIndex = signal<number | null>(null);
  // Pre-selección: fila confirmada con click o primer Enter
  selectedIndex = signal<number | null>(null);

  // Ordenamiento
  sortCol = signal<SortCol>(null);
  sortDir = signal<SortDir>(null);

  resultadosOrdenados = computed(() => {
    const lista = [...this.resultados()];
    const col = this.sortCol();
    const dir = this.sortDir();
    if (!col || !dir) return lista;

    const numericCols: SortCol[] = ['precio_venta', 'inventario_actual'];
    return lista.sort((a, b) => {
      let va: string | number = (a as any)[col] ?? '';
      let vb: string | number = (b as any)[col] ?? '';
      if (numericCols.includes(col)) {
        va = Number(va);
        vb = Number(vb);
      } else if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = (vb as string).toLowerCase();
      }
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  private searchSubject = new Subject<string>();

  constructor(
    private ventasService: VentasService,
    private snackBar: MatSnackBar,
  ) {
    this.searchSubject.pipe(
      debounceTime(280),
      distinctUntilChanged(),
      switchMap(q => {
        this.cargando.set(true);
        return this.ventasService.buscarProducto(q);
      })
    ).subscribe({
      next: productos => {
        this.resultados.set(productos);
        this.cargando.set(false);
        // Auto-focus primer resultado al llegar nuevos resultados
        if (productos.length > 0) {
          this.activeIndex.set(0);
          this.selectedIndex.set(null);
          setTimeout(() => this.scrollFilaVisible(0), 0);
        } else {
          this.activeIndex.set(null);
          this.selectedIndex.set(null);
        }
      },
      error: () => this.cargando.set(false)
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 100);
  }

  onSearch(valor: string): void {
    this.query.set(valor);
    if (valor.length >= 1) {
      this.searchSubject.next(valor);
    } else {
      this.resultados.set([]);
      this.activeIndex.set(null);
      this.selectedIndex.set(null);
    }
  }

  sortBy(col: SortCol): void {
    if (this.sortCol() !== col) {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    } else {
      const ciclo: SortDir[] = ['asc', 'desc', null];
      const actual = this.sortDir();
      const siguiente = ciclo[(ciclo.indexOf(actual) + 1) % ciclo.length];
      this.sortDir.set(siguiente);
      if (!siguiente) this.sortCol.set(null);
    }
    this.activeIndex.set(null);
    this.selectedIndex.set(null);
  }

  sortIconFor(col: SortCol): string {
    if (this.sortCol() !== col || !this.sortDir()) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const lista = this.resultadosOrdenados();
    if (lista.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const actual = this.activeIndex() ?? -1;
      const next = Math.min(actual + 1, lista.length - 1);
      this.activeIndex.set(next);
      this.scrollFilaVisible(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const actual = this.activeIndex() ?? lista.length;
      const next = Math.max(actual - 1, 0);
      this.activeIndex.set(next);
      this.scrollFilaVisible(next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.activeIndex();
      if (idx === null || !lista[idx]) return;
      if (this.selectedIndex() === idx) {
        this.agregarProducto(lista[idx]);
      } else {
        this.selectedIndex.set(idx);
      }
    }
  }

  onRowClick(i: number): void {
    // Devolver foco al input inmediatamente para que las flechas sigan funcionando
    this.searchInputRef?.nativeElement.focus();
    if (this.selectedIndex() === i) {
      this.agregarProducto(this.resultadosOrdenados()[i]);
    } else {
      this.activeIndex.set(i);
      this.selectedIndex.set(i);
    }
  }

  private scrollFilaVisible(idx: number): void {
    const container = this.containerRef?.nativeElement;
    if (!container) return;
    const row = container.querySelector(`[data-row-index="${idx}"]`) as HTMLElement;
    row?.scrollIntoView({ block: 'nearest' });
  }

  agregarProducto(producto: Producto): void {
    // Limpiar índices antes de emitir para que no haya scroll al cerrar
    this.activeIndex.set(null);
    this.selectedIndex.set(null);
    if (this.modoDevolucion) {
      this.devolucionSeleccionada.emit(producto);
      return;
    }
    if (!this.ticketActivo) return;
    if (producto.tipo === 'granel') {
      this.granelSeleccionado.emit(producto);
      return;
    }
    this.ventasService.agregarItem(
      this.ticketActivo.id,
      producto.id,
      1,
      this.usarMayoreoExterno
    ).subscribe({
      next: ticket => {
        this.productoAgregado.emit(producto);
        this.itemAgregado.emit(ticket);
        this.snackBar.open(`${producto.nombre} agregado`, '', { duration: 1200 });
      },
      error: (err) => {
        const msg = err.error?.error || 'Error al agregar producto';
        this.snackBar.open(msg, '', { duration: 3000 });
      }
    });
  }
}
