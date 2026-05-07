import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { LogsService } from '../services/logs';

export const errorLogInterceptor: HttpInterceptorFn = (req, next) => {
  // Evitar loop infinito: no interceptar el propio endpoint de logs
  if (req.url.includes('/logs/')) {
    return next(req);
  }

  const logsService = inject(LogsService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Log para todo error >= 400, excepto 401 (manejado por auth-interceptor)
      if (error.status >= 400 && error.status !== 401) {
        LogsService.registrarError(
          error.status,
          req.method,
          req.url,
          error.error,
          logsService.sessionId,
        );
      }
      return throwError(() => error);
    })
  );
};
