from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from django_apscheduler.jobstores import DjangoJobStore
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def iniciar_scheduler():
    from tareas.jobs import (
        verificar_creditos_por_vencer,
        verificar_creditos_vencidos,
        verificar_productos_estancados,
        generar_cierre_de_caja,
        backup_diario,
        limpiar_backups,
    )

    scheduler = BackgroundScheduler(timezone=settings.TIME_ZONE)
    scheduler.add_jobstore(DjangoJobStore(), 'default')

    # Definimos las tareas en una lista para procesarlas limpiamente
    tareas = [
        {
            'id': 'verificar_creditos_por_vencer',
            'func': verificar_creditos_por_vencer,
            'trigger': CronTrigger(hour=8, minute=0),
        },
        {
            'id': 'verificar_creditos_vencidos',
            'func': verificar_creditos_vencidos,
            'trigger': CronTrigger(hour=8, minute=5),
        },
        {
            'id': 'verificar_productos_estancados',
            'func': verificar_productos_estancados,
            'trigger': CronTrigger(day_of_week='mon', hour=9, minute=0),
        },
        {
            'id': 'generar_cierre_de_caja',
            'func': generar_cierre_de_caja,
            'trigger': CronTrigger(hour=23, minute=0),
        },
        {
            'id': 'backup_diario',
            'func': backup_diario,
            'trigger': CronTrigger(hour=2, minute=0),
        },
        {
            'id': 'limpiar_backups_mensual',
            'func': limpiar_backups,
            'trigger': CronTrigger(day=5, hour=3, minute=0),
        },
    ]

    for tarea in tareas:
        # Verificamos si el job ya existe para evitar el error de INSERT en Postgres
        if not scheduler.get_job(tarea['id']):
            scheduler.add_job(
                tarea['func'],
                trigger=tarea['trigger'],
                id=tarea['id'],
                replace_existing=True,
            )
            logger.info(f"🆕 Tarea programada por primera vez: {tarea['id']}")
        else:
            # Si ya existe, replace_existing=True lo actualizará internamente 
            # solo si es necesario, pero get_job ayuda a evitar el log de error inicial
            scheduler.add_job(
                tarea['func'],
                trigger=tarea['trigger'],
                id=tarea['id'],
                replace_existing=True,
            )
            logger.info(f"✅ Tarea existente verificada/actualizada: {tarea['id']}")

    try:
        scheduler.start()
        logger.info('🚀 Scheduler iniciado correctamente')
    except Exception as e:
        logger.error(f'❌ Error al iniciar el scheduler: {e}')
        
    return scheduler
