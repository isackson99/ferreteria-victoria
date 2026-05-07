import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-confirmar-borrar-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirm-dialog">
      <div class="confirm-header">
        <mat-icon class="confirm-icon">delete_outline</mat-icon>
        <h3>Eliminar artículo</h3>
      </div>
      <div class="confirm-body">
        <p>¿Deseas eliminar este producto del carrito?</p>
      </div>
      <div class="confirm-footer">
        <button mat-stroked-button (click)="ref.close(false)">Cancelar</button>
        <button mat-flat-button color="warn" (click)="ref.close(true)" cdkFocusInitial>
          <mat-icon>delete</mat-icon> Eliminar
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog { min-width: 320px; }

    .confirm-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 20px;
      background: #c62828;
      color: white;
      border-radius: 4px 4px 0 0;

      mat-icon { font-size: 22px; width: 22px; height: 22px; }
      h3 { margin: 0; font-size: 16px; font-weight: 600; }
    }

    .confirm-body {
      padding: 20px 24px 8px;
      p { margin: 0; font-size: 15px; color: #424242; }
    }

    .confirm-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 20px 16px;
    }
  `]
})
export class ConfirmarBorrarDialog {
  constructor(public ref: MatDialogRef<ConfirmarBorrarDialog>) {}
}
