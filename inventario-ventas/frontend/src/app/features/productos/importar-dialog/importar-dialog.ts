import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  ProductosService,
  ImportarResultado,
  PreviewImportacion,
} from '../../../core/services/productos';

type Estado = 'inicial' | 'preview' | 'importando' | 'resultado';

@Component({
  selector: 'app-importar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './importar-dialog.html',
  styleUrl: './importar-dialog.scss',
})
export class ImportarDialogComponent {
  private svc = inject(ProductosService);
  private dialogRef = inject(MatDialogRef<ImportarDialogComponent>);

  estado = signal<Estado>('inicial');
  archivo = signal<File | null>(null);
  preview = signal<PreviewImportacion | null>(null);
  resultado = signal<ImportarResultado | null>(null);
  cargandoPreview = signal(false);
  errorMsg = signal('');
  mostrarErrores = signal(false);

  onArchivoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      this.errorMsg.set('Solo se aceptan archivos .xlsx y .csv');
      return;
    }

    this.archivo.set(file);
    this.errorMsg.set('');
    this.preview.set(null);
    this.cargandoPreview.set(true);

    this.svc.previewImportacion(file).subscribe({
      next: (data) => {
        this.preview.set(data);
        this.estado.set('preview');
        this.cargandoPreview.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error || 'Error al leer el archivo');
        this.cargandoPreview.set(false);
      },
    });
  }

  importar(): void {
    const file = this.archivo();
    if (!file) return;
    this.estado.set('importando');
    this.errorMsg.set('');

    this.svc.importarProductos(file).subscribe({
      next: (data) => {
        this.resultado.set(data);
        this.estado.set('resultado');
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error || 'Error al importar');
        this.estado.set('preview');
      },
    });
  }

  descargarPlantilla(): void {
    this.svc.descargarPlantilla().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_importacion_productos.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {},
    });
  }

  resetear(): void {
    this.estado.set('inicial');
    this.archivo.set(null);
    this.preview.set(null);
    this.resultado.set(null);
    this.errorMsg.set('');
    this.mostrarErrores.set(false);
  }

  cerrar(): void {
    this.dialogRef.close(this.estado() === 'resultado');
  }

  get totalColumnas(): number {
    return this.preview()?.columnas.length ?? 0;
  }

  get reconocidas(): number {
    return this.preview()?.columnas_reconocidas.length ?? 0;
  }
}
