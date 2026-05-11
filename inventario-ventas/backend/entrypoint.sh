#!/bin/bash
set -e

echo "Esperando PostgreSQL en ${DB_HOST:-db}:${DB_PORT:-5432}..."
while ! nc -z ${DB_HOST:-db} ${DB_PORT:-5432}; do
  sleep 1
done
echo "PostgreSQL listo"

echo "Ejecutando migraciones..."
python manage.py migrate --noinput

echo "Cargando datos de demo..."
python manage.py shell < load_demo_data.py || echo "Demo data falló, continuando..."

echo "Iniciando servidor Daphne..."
exec daphne -b 0.0.0.0 -p 8000 core.asgi:application
