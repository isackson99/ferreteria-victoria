import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'ventas', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'ventas',
    canActivate: [authGuard],
    loadComponent: () => import('./features/ventas/ventas/ventas').then(m => m.VentasComponent)
  },
  {
    path: 'productos',
    canActivate: [authGuard],
    loadComponent: () => import('./features/productos/productos').then(m => m.ProductosComponent)
  },
  {
    path: 'inventario',
    canActivate: [authGuard],
    loadComponent: () => import('./features/inventario/inventario').then(m => m.InventarioComponent)
  },
  {
    path: 'creditos',
    canActivate: [authGuard],
    loadComponent: () => import('./features/creditos/creditos').then(m => m.CreditosComponent)
  },
  {
    path: 'clientes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/clientes/clientes').then(m => m.ClientesComponent)
  },
  {
    path: 'configuracion',
    canActivate: [authGuard],
    loadComponent: () => import('./features/configuracion/configuracion').then(m => m.ConfiguracionComponent)
  },
  {
    path: 'corte',
    canActivate: [authGuard],
    loadComponent: () => import('./features/corte/corte').then(m => m.CorteComponent)
  },
  {
    path: 'reportes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/reportes/reportes').then(m => m.ReportesComponent)
  },
  {
    path: 'notificaciones',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notificaciones/notificaciones').then(m => m.NotificacionesComponent)
  },
  {
    path: 'usuarios',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/usuarios/usuarios').then(m => m.UsuariosComponent)
  },
  { path: '**', redirectTo: 'login' }
];
