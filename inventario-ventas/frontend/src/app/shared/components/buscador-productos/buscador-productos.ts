import {
  Component, AfterViewInit, ViewChild, ElementRef,
  Inject, signal, inject, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProductosService, ProductoDetalle } from '../../../core/services/productos';

@Component({
  selector: 'app-buscador-productos',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatTableModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './buscador-productos.html',
  styleUrl: './buscador-productos.scss',
})
export class BuscadorProductosComponent implements AfterViewInit, OnDestroy {
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  query = signal('');
  resultados = signal<ProductoDetalle[]>([]);
  cargando = signal(false);
  filaSeleccionada = signal<number | null>(null);
  mostrarHint = signal(false);
  columnas = ['codigo', 'nombre', 'categoria', 'precio_venta', 'precio_mayoreo', 'existencia'];

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private productosService = inject(ProductosService);
  private dialogRef = inject(MatDialogRef<BuscadorProductosComponent>);

  constructor(@Inject(MAT_DIALOG_DATA) public data: { query?: string }) {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q || q.length < 1) { this.cargando.set(false); return of([]); }
        this.cargando.set(true);
        return this.productosService.buscar(q).pipe(catchError(() => of([])));
      }),
      takeUntil(this.destroy$)
    ).subscribe(res => {
      this.resultados.set(res);
      this.filaSeleccionada.set(res.length > 0 ? 0 : null);
      this.cargando.set(false);
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 50);
    if (this.data?.query) {
      this.query.set(this.data.query);
      this.searchSubject.next(this.data.query);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearch(value: string) {
    this.query.set(value);
    this.searchSubject.next(value);
  }

  seleccionar(prod: ProductoDetalle) {
    this.dialogRef.close(prod);
  }

  onKeyDown(event: KeyboardEvent) {
    const res = this.resultados();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const current = this.filaSeleccionada() ?? -1;
      this.filaSeleccionada.set(Math.min(current + 1, res.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const current = this.filaSeleccionada() ?? 0;
      this.filaSeleccionada.set(Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.filaSeleccionada();
      if (idx !== null && res[idx]) this.seleccionar(res[idx]);
    } else if (event.key === 'Escape') {
      this.dialogRef.close(null);
    }
  }

  colorExistencia(p: ProductoDetalle): string {
    if (p.inventario_actual <= 0) return 'rojo';
    if (p.stock_bajo) return 'naranja';
    return 'verde';
  }

  cerrar() {
    this.dialogRef.close(null);
  }
}
