import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface DescuentoDialogData {
  total: number;
}

export interface DescuentoDialogResult {
  monto: number;
  porcentaje: number;
}

@Component({
  selector: 'app-descuento-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Aplicar Descuento</h2>

    <mat-dialog-content>
      <div class="total-actual">
        Total actual: <strong>{{ data.total | currency:'CLP':'$':'1.0-0' }}</strong>
      </div>

      <div class="campos-fila">
        <div class="campo">
          <label>Descuento %</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            [(ngModel)]="porcentaje"
            (ngModelChange)="onPorcentajeChange($event)"
            (keydown.enter)="aplicar()"
            (focus)="$event.target.select()"
            class="campo-input"
            placeholder="0.00"
            cdkFocusInitial>
        </div>
        <div class="campo">
          <label>Monto descuento $</label>
          <input
            type="number"
            step="1"
            min="0"
            [(ngModel)]="monto"
            (ngModelChange)="onMontoChange($event)"
            (keydown.enter)="aplicar()"
            (focus)="$event.target.select()"
            class="campo-input"
            placeholder="0">
        </div>
      </div>

      <div class="total-resultado" [class.total-valido]="totalConDescuento >= 0 && monto > 0">
        Total con descuento:
        <strong>{{ totalConDescuento | currency:'CLP':'$':'1.0-0' }}</strong>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button
        mat-raised-button
        color="primary"
        (click)="aplicar()"
        [disabled]="monto <= 0 || monto > data.total">
        Aplicar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 600;
    }
    .total-actual {
      text-align: center;
      color: #555;
      font-size: 0.95rem;
      padding: 4px 0 14px;

      strong { font-size: 1.1rem; color: #1a237e; }
    }
    .campos-fila {
      display: flex;
      gap: 16px;
      margin-bottom: 14px;
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
      border-color: #1a237e;
    }
    .total-resultado {
      text-align: center;
      background: #f5f5f5;
      border-radius: 4px;
      padding: 10px 16px;
      font-size: 0.95rem;
      color: #616161;

      strong { font-size: 1.15rem; }

      &.total-valido {
        background: #e8f5e9;
        color: #2e7d32;
      }
    }
  `]
})
export class DescuentoDialog {
  porcentaje = 0;
  monto = 0;

  get totalConDescuento(): number {
    return this.data.total - this.monto;
  }

  constructor(
    public dialogRef: MatDialogRef<DescuentoDialog>,
    @Inject(MAT_DIALOG_DATA) public data: DescuentoDialogData
  ) {}

  onPorcentajeChange(val: number): void {
    const pct = Math.max(0, Math.min(100, Number(val) || 0));
    this.monto = Math.round((pct / 100) * this.data.total);
  }

  onMontoChange(val: number): void {
    const m = Math.max(0, Number(val) || 0);
    if (this.data.total > 0) {
      this.porcentaje = Math.round((m / this.data.total) * 10000) / 100;
    }
  }

  aplicar(): void {
    if (this.monto > 0 && this.monto <= this.data.total) {
      this.dialogRef.close({ monto: this.monto, porcentaje: this.porcentaje } as DescuentoDialogResult);
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
