import { Component, OnInit, inject, effect } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InactividadService } from './core/services/inactividad';
import { AuthService } from './core/services/auth';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatSnackBarModule],
  template: '<router-outlet />',
})
export class App implements OnInit {
  private inactividad = inject(InactividadService);
  private authService = inject(AuthService);
  private http        = inject(HttpClient);
  private snackBar    = inject(MatSnackBar);
  private router      = inject(Router);

  private yaVerificado = false;

  constructor() {
    effect(() => {
      const usuario = this.authService.usuarioActual();
      if (usuario && !this.yaVerificado) {
        this.yaVerificado = true;
        this.verificarProductosSinCosto();
      } else if (!usuario) {
        this.yaVerificado = false;
      }
    });
  }

  ngOnInit(): void {
    this.inactividad.iniciar();
  }

  private verificarProductosSinCosto(): void {
    this.http.get<{ count: number }>('http://192.168.1.8:8000/api/productos/sin_costo/').subscribe({
      next: (res) => {
        if (res.count > 0) {
          const ref = this.snackBar.open(
            `⚠ Hay ${res.count} producto(s) sin precio costo. Ve a Productos para actualizarlos.`,
            'Ver productos',
            { duration: 8000 }
          );
          ref.onAction().subscribe(() => this.router.navigate(['/productos']));
        }
      },
      error: () => {},
    });
  }
}
