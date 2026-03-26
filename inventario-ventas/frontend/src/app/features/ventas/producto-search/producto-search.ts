import { Component, Input, Output, EventEmitter, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { VentasService, Venta, Producto } from '../../../core/services/ventas';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

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

  @Input() ticketActivo: Venta | null = null;
  @Input() usarMayoreoExterno = false;

  @Output() itemAgregado = new EventEmitter<Venta>();
  @Output() productoAgregado = new EventEmitter<Producto>();
  @Output() granelSeleccionado = new EventEmitter<Producto>();

  query = signal('');
  resultados = signal<Producto[]>([]);
  cargando = signal(false);
  filaSeleccionada = signal<number | null>(null);
  mostrarHint = signal(false);

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
        this.filaSeleccionada.set(null);
        this.cargando.set(false);
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
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    const resultados = this.resultados();
    if (resultados.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const actual = this.filaSeleccionada() ?? -1;
      this.filaSeleccionada.set(Math.min(actual + 1, resultados.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const actual = this.filaSeleccionada() ?? resultados.length;
      this.filaSeleccionada.set(Math.max(actual - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.filaSeleccionada();
      if (idx !== null && resultados[idx]) {
        this.agregarProducto(resultados[idx]);
      }
    }
  }

  agregarProducto(producto: Producto): void {
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
