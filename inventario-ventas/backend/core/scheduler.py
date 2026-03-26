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
    )

    scheduler = BackgroundScheduler(timezone=settings.TIME_ZONE)
    scheduler.add_jobstore(DjangoJobStore(), 'default')

    # Verifica créditos por vencer — todos los días a las 8:00 AM
    scheduler.add_job(
        verificar_creditos_por_vencer,
        trigger=CronTrigger(hour=8, minute=0),
        id='verificar_creditos_por_vencer',
        replace_existing=True,
    )

    # Verifica créditos vencidos — todos los días a las 8:05 AM
    scheduler.add_job(
        verificar_creditos_vencidos,
        trigger=CronTrigger(hour=8, minute=5),
        id='verificar_creditos_vencidos',
        replace_existing=True,
    )

    # Verifica productos estancados — todos los lunes a las 9:00 AM
    scheduler.add_job(
        verificar_productos_estancados,
        trigger=CronTrigger(day_of_week='mon', hour=9, minute=0),
        id='verificar_productos_estancados',
        replace_existing=True,
    )

    # Cierre de caja — todos los días a las 11:00 PM
    scheduler.add_job(
        generar_cierre_de_caja,
        trigger=CronTrigger(hour=23, minute=0),
        id='generar_cierre_de_caja',
        replace_existing=True,
    )

    scheduler.start()
    logger.info('✅ Scheduler iniciado correctamente')
    return scheduler