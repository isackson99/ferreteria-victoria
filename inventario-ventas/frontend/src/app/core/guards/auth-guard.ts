import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

/** Verificar con el backend cada hora como máximo */
const VERIFICACION_INTERVAL_MS = 60 * 60 * 1000;

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router      = inject(Router);

  if (!authService.estaAutenticado()) {
    router.navigate(['/login']);
    return false;
  }

  const ahora       = Date.now();
  const ultimaVerif = parseInt(localStorage.getItem('ultima_verificacion') ?? '0', 10);

  // Si se verificó hace menos de 1 hora, confiar en localStorage
  if (ahora - ultimaVerif < VERIFICACION_INTERVAL_MS) {
    return true;
  }

  // Verificar con el backend que el token sigue siendo válido
  return authService.verificarToken().pipe(
    map(valido => {
      if (valido) {
        localStorage.setItem('ultima_verificacion', String(ahora));
        return true;
      }
      router.navigate(['/login']);
      return false;
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};
