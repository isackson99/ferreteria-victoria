import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Producto } from '../../../core/services/ventas';

export interface CantidadGranelData {
  producto: Producto;
  precio_unitario: number;
}

export interface CantidadGranelResult {
  cantidad: number;
}

@Component({
  selector: 'app-cantidad-granel-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>¿Cantidad del Producto?</h2>
    <div class="subtitulo">{{ data.producto.nombre }}</div>

    <mat-dialog-content>
      <div class="campos-fila">
        <div class="campo">
          <label>Cantidad del Producto:</label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            [(ngModel)]="cantidad"
            (ngModelChange)="onCantidadChange($event)"
            (focus)="$event.target.select()"
            class="campo-input">
        </div>
        <div class="campo">
          <label>Importe Actual:</label>
          <input
            type="number"
            step="0.01"
            [(ngModel)]="importe"
            (ngModelChange)="onImporteChange($event)"
            (focus)="$event.target.select()"
            class="campo-input">
        </div>
      </div>
      <div class="precio-unitario-label">
        Precio Unitario = {{ precioUnitario | currency:'CLP':'$':'1.0-0' }}
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="aceptar()" [disabled]="cantidad <= 0">
        Aceptar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 600;
    }
    .subtitulo {
      text-align: center;
      color: #1565c0;
      font-weight: bold;
      font-size: 1rem;
      padding: 4px 24px 8px;
    }
    .campos-fila {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
    }
    .campo {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }
    .campo label {
      font-size: 0.82rem;
      color: #555;
      font-weight: 500;
    }
    .campo-input {
      border: 1px solid #bdbdbd;
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 1rem;
      width: 100%;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    .campo-input:focus {
      border-color: #1565c0;
    }
    .precio-unitario-label {
      text-align: center;
      color: #555;
      font-size: 0.9rem;
      margin-top: 4px;
    }
  `]
})
export class CantidadGranelDialog {
  cantidad = 1.000;
  importe: number;
  precioUnitario: number;

  constructor(
    public dialogRef: MatDialogRef<CantidadGranelDialog>,
    @Inject(MAT_DIALOG_DATA) public data: CantidadGranelData
  ) {
    this.precioUnitario = Number(data.precio_unitario);
    this.importe = this.precioUnitario;
  }

  onCantidadChange(val: number): void {
    const c = Number(val) || 0;
    this.importe = Math.round(c * this.precioUnitario * 100) / 100;
  }

  onImporteChange(val: number): void {
    const imp = Number(val) || 0;
    if (this.precioUnitario > 0) {
      this.cantidad = Math.round((imp / this.precioUnitario) * 1000) / 1000;
    }
  }

  aceptar(): void {
    if (this.cantidad > 0) {
      this.dialogRef.close({ cantidad: this.cantidad } as CantidadGranelResult);
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
