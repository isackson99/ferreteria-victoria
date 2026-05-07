import traceback


class LogErrorMiddleware:
    """Intercepta excepciones no manejadas y las registra en LogEvento."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        try:
            from logs.views import log_evento
            log_evento(
                request=request,
                tipo='ERROR',
                modulo=request.path[:100],
                descripcion=f'{type(exception).__name__}: {str(exception)[:400]}',
                detalle=traceback.format_exc(),
                nivel='ERROR',
            )
        except Exception:
            pass
        return None  # Deja que Django siga manejando la respuesta
