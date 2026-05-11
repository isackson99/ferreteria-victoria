# Arquitectura del Sistema

## Diagrama general
┌─────────────────┐
│  Frontend       │
│  Angular 21     │
│  Port: 4200     │
└────────┬────────┘
│ HTTP + WebSocket
│
┌────────▼────────┐
│  Backend        │
│  Django+DRF     │
│  Daphne         │
│  Port: 8000     │
└────────┬────────┘
│
┌────┴────┐
│          │
┌───▼──┐   ┌──▼────┐
│  DB  │   │ Redis  │
│  PG  │   │ 6379   │
└──────┘   └────────┘

## Stack detalles

### Backend
- **Framework**: Django 4.x
- **API**: Django REST Framework
- **WebSocket**: Django Channels + Daphne
- **Cache/Queue**: Redis
- **DB**: PostgreSQL 15

### Frontend
- **Framework**: Angular 21
- **UI**: Angular Material
- **Charts**: Chart.js
- **Build**: Webpack (ng build)

## Flujo de datos

1. **Usuario interactúa** en frontend
2. **Request HTTP/GraphQL** al backend
3. **Django procesa**: valida, lógica negocio
4. **DB query** a PostgreSQL
5. **Response JSON** al frontend
6. **Angular actualiza** la UI

## Permisos

Sistema granular:
- Usuario → Grupo → Permisos específicos por módulo
- Verificación en frontend (UX) y backend (seguridad)

## Deployment

- Docker Compose orquesta servicios
- Volume persistence para datos
- Network isolation entre contenedores