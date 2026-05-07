import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Producto } from '../../../core/services/ventas';

export interface CantidadDevolucionData {
  producto: Producto;
  precio_unitario: number;
}

export interface CantidadDevolucionResult {
  cantidad: number;
}

@Component({
  selector: 'app-cantidad-devolucion-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>¿Cantidad a devolver?</h2>
    <div class="subtitulo">{{ data.producto.nombre }}</div>

    <mat-dialog-content>
      <div class="campos-fila">
        <div class="campo">
          <label>Cantidad:</label>
          <input
            type="number"
            step="1"
            min="1"
            [(ngModel)]="cantidad"
            (ngModelChange)="onCantidadChange($event)"
            (keydown.enter)="aceptar()"
            (focus)="$event.target.select()"
            class="campo-input"
            cdkFocusInitial>
        </div>
        <div class="campo">
          <label>Importe:</label>
          <input
            type="text"
            [value]="importe | currency:'CLP':'$':'1.0-0'"
            readonly
            class="campo-input campo-readonly">
        </div>
      </div>
      <div class="precio-unitario-label">
        Precio Unitario = {{ precioUnitario | currency:'CLP':'$':'1.0-0' }}
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-raised-button color="warn" (click)="aceptar()" [disabled]="cantidad < 1">
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
      color: #c62828;
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
      border-color: #c62828;
    }
    .campo-readonly {
      background: #f5f5f5;
      color: #424242;
      cursor: default;
    }
    .precio-unitario-label {
      text-align: center;
      color: #555;
      font-size: 0.9rem;
      margin-top: 4px;
    }
  `]
})
export class CantidadDevolucionDialog {
  cantidad = 1;
  importe: number;
  precioUnitario: number;

  constructor(
    public dialogRef: MatDialogRef<CantidadDevolucionDialog>,
    @Inject(MAT_DIALOG_DATA) public data: CantidadDevolucionData
  ) {
    this.precioUnitario = Number(data.precio_unitario);
    this.importe = this.precioUnitario;
  }

  onCantidadChange(val: number): void {
    const c = Math.max(1, Math.floor(Number(val) || 1));
    this.cantidad = c;
    this.importe = c * this.precioUnitario;
  }

  aceptar(): void {
    const c = Math.max(1, Math.floor(this.cantidad));
    if (c >= 1) {
      this.dialogRef.close({ cantidad: c } as CantidadDevolucionResult);
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
