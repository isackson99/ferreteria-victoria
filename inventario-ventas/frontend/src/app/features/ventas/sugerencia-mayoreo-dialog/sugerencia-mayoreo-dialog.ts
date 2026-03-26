import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface SugerenciaMayoreoData {
  nombre: string;
  cantidad: number;
  precioNormal: number;
  precioMayoreo: number;
  totalNormal: number;
  totalMayoreo: number;
}

@Component({
  selector: 'app-sugerencia-mayoreo-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="dialog-header">
      <mat-icon class="header-icon">savings</mat-icon>
      <h2 mat-dialog-title>Precio Mayoreo Disponible</h2>
    </div>

    <mat-dialog-content>
      <p class="producto-nombre">{{ data.nombre }}</p>
      <p class="califica-texto">
        Cantidad actual ({{ data.cantidad }}) califica para precio mayoreo.
      </p>

      <table class="tabla-comparativa">
        <thead>
          <tr>
            <th></th>
            <th>Precio Unit.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr class="fila-normal">
            <td>Normal</td>
            <td>{{ data.precioNormal | currency:'CLP':'$':'1.0-0' }}</td>
            <td>{{ data.totalNormal | currency:'CLP':'$':'1.0-0' }}</td>
          </tr>
          <tr class="fila-mayoreo">
            <td><strong>Mayoreo ✓</strong></td>
            <td><strong>{{ data.precioMayoreo | currency:'CLP':'$':'1.0-0' }}</strong></td>
            <td><strong>{{ data.totalMayoreo | currency:'CLP':'$':'1.0-0' }}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="ahorro-badge">
        <mat-icon>arrow_downward</mat-icon>
        Ahorro: {{ ahorro | currency:'CLP':'$':'1.0-0' }}
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="noAplicar()">No aplicar</button>
      <button mat-raised-button class="btn-aplicar" (click)="aplicar()">
        <mat-icon>check_circle</mat-icon>
        Aplicar Precio Mayoreo
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 24px 0;
    }
    .header-icon {
      color: #2e7d32;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
    h2[mat-dialog-title] {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      color: #1b5e20;
    }
    .producto-nombre {
      text-align: center;
      font-weight: bold;
      font-size: 1rem;
      color: #1565c0;
      margin: 0 0 4px;
    }
    .califica-texto {
      text-align: center;
      color: #555;
      font-size: 0.88rem;
      margin: 0 0 16px;
    }
    .tabla-comparativa {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .tabla-comparativa th {
      text-align: right;
      font-size: 0.82rem;
      color: #777;
      padding: 4px 8px;
      border-bottom: 1px solid #e0e0e0;
    }
    .tabla-comparativa th:first-child { text-align: left; }
    .tabla-comparativa td {
      padding: 8px;
      text-align: right;
      font-size: 0.95rem;
    }
    .tabla-comparativa td:first-child { text-align: left; }
    .fila-normal td { color: #888; }
    .fila-mayoreo {
      background: #e8f5e9;
      border-radius: 4px;
    }
    .fila-mayoreo td { color: #2e7d32; }
    .ahorro-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #2e7d32;
      color: white;
      border-radius: 20px;
      padding: 6px 16px;
      font-weight: bold;
      font-size: 0.95rem;
      margin: 0 auto;
      width: fit-content;
    }
    .ahorro-badge mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .btn-aplicar {
      background-color: #2e7d32 !important;
      color: white !important;
    }
  `]
})
export class SugerenciaMayoreoDialog {
  ahorro: number;

  constructor(
    public dialogRef: MatDialogRef<SugerenciaMayoreoDialog>,
    @Inject(MAT_DIALOG_DATA) public data: SugerenciaMayoreoData
  ) {
    this.ahorro = data.totalNormal - data.totalMayoreo;
  }

  aplicar(): void {
    this.dialogRef.close(true);
  }

  noAplicar(): void {
    this.dialogRef.close(false);
  }
}
