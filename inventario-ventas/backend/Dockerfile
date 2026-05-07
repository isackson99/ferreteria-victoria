FROM python:3.13-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY . .

# Crear carpeta de backups
RUN mkdir -p backups

# Exponer puerto
EXPOSE 8000

# Comando de inicio
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "core.asgi:application"]