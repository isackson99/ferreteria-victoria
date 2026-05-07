import logging
from datetime import datetime, timezone
from pathlib import Path
from django.conf import settings
from django.core import management
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(settings.BASE_DIR) / 'backups'
LIMITE_BYTES = 20 * 1024 * 1024 * 1024  # 20 GB


def _es_admin(user) -> bool:
    return user.is_superuser or (
        hasattr(user, 'rol') and user.rol and user.rol.nombre.lower() == 'admin'
    )


class ListarBackupsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _es_admin(request.user):
            return Response({'error': 'Sin permiso'}, status=status.HTTP_403_FORBIDDEN)

        if not BACKUP_DIR.exists():
            return Response([])

        archivos = []
        for f in sorted(BACKUP_DIR.glob('*'), key=lambda x: x.stat().st_mtime, reverse=True):
            if f.is_file():
                archivos.append({
                    'nombre': f.name,
                    'fecha': datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
                    'tamano_mb': round(f.stat().st_size / 1024 / 1024, 2),
                })
        return Response(archivos)


class BackupManualView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _es_admin(request.user):
            return Response({'error': 'Sin permiso'}, status=status.HTTP_403_FORBIDDEN)

        try:
            management.call_command('dbbackup', verbosity=0)
            logger.info(f'Backup manual creado por {request.user.username}')
            return Response({'mensaje': 'Backup creado exitosamente'})
        except Exception as e:
            logger.error(f'Error en backup manual: {e}')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
