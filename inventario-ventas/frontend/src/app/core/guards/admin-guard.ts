import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.usuarioActual();
  if (user && (user.is_superuser || user.rol?.nombre?.toLowerCase() === 'admin')) return true;
  return router.createUrlTree(['/ventas']);
};
