from django.db import models


class LogEvento(models.Model):
    TIPO_CHOICES = [
        ('ERROR',         'Error'),
        ('CAMBIO_TICKET', 'Cambio de Ticket'),
        ('VENTA',         'Venta'),
        ('ACCESO',        'Acceso'),
        ('ADVERTENCIA',   'Advertencia'),
        ('PRODUCTO',      'Producto'),
        ('CLIENTE',       'Cliente'),
        ('CREDITO',       'Crédito'),
        ('CAJA',          'Caja'),
        ('CONFIGURACION', 'Configuración'),
    ]
    NIVEL_CHOICES = [
        ('INFO',    'Info'),
        ('WARNING', 'Warning'),
        ('ERROR',   'Error'),
    ]

    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)
    usuario     = models.ForeignKey(
        'usuarios.Usuario', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='logs'
    )
    tipo        = models.CharField(max_length=20, choices=TIPO_CHOICES, db_index=True)
    modulo      = models.CharField(max_length=100, db_index=True)
    descripcion = models.CharField(max_length=500)
    detalle     = models.TextField(null=True, blank=True)
    ip          = models.CharField(max_length=45, null=True, blank=True)
    nivel       = models.CharField(max_length=10, choices=NIVEL_CHOICES, default='INFO', db_index=True)
    ticket_id   = models.IntegerField(null=True, blank=True, db_index=True)
    session_id  = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    duracion_ms = models.IntegerField(null=True, blank=True)
    datos_extra = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Log de Evento'
        verbose_name_plural = 'Logs de Eventos'

    def __str__(self):
        return f'[{self.nivel}] {self.tipo} — {self.descripcion[:60]} ({self.timestamp:%Y-%m-%d %H:%M})'
