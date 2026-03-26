import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Producto


class InventarioConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Todos los clientes entran al mismo grupo
        self.group_name = 'inventario'

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        await self.accept()

        # Al conectarse, el cliente recibe el stock actual completo
        await self.enviar_stock_completo()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

    # Mensajes recibidos desde el cliente (Angular)
    async def receive(self, text_data):
        data = json.loads(text_data)
        accion = data.get('accion')

        if accion == 'solicitar_stock':
            await self.enviar_stock_completo()

    # Evento disparado cuando un producto cambia (lo llama la vista al vender)
    async def stock_actualizado(self, event):
        await self.send(text_data=json.dumps({
            'tipo': 'stock_actualizado',
            'producto': event['producto']
        }))

    # Evento para notificar venta completada a todos
    async def venta_completada(self, event):
        await self.send(text_data=json.dumps({
            'tipo': 'venta_completada',
            'ticket': event['ticket'],
            'usuario': event['usuario']
        }))

    # Evento de alerta stock bajo
    async def alerta_stock_bajo(self, event):
        await self.send(text_data=json.dumps({
            'tipo': 'alerta_stock_bajo',
            'producto': event['producto']
        }))

    # Evento cierre de sesión admin — desconecta a todos
    async def servidor_cerrado(self, event):
        await self.send(text_data=json.dumps({
            'tipo': 'servidor_cerrado',
            'mensaje': event['mensaje']
        }))
        await self.close()

    # ── Helpers ──────────────────────────────────────────────

    async def enviar_stock_completo(self):
        productos = await self.get_productos()
        await self.send(text_data=json.dumps({
            'tipo': 'stock_completo',
            'productos': productos
        }))

    @database_sync_to_async
    def get_productos(self):
        productos = list(
            Producto.objects.filter(activo=True).values(
                'id', 'nombre', 'codigo', 'precio', 'stock', 'stock_minimo'
            )
        )
    # Convertir Decimal a float para que JSON lo acepte
        for p in productos:
            p['precio'] = float(p['precio'])
        return productos    