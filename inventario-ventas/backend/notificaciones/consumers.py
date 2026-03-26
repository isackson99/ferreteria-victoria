import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class NotificacionConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')

        # If not authenticated via session, try JWT from query string
        if not user or not user.is_authenticated:
            query_string = self.scope.get('query_string', b'').decode()
            params = {}
            for param in query_string.split('&'):
                if '=' in param:
                    k, v = param.split('=', 1)
                    params[k] = v
            token = params.get('token')
            if token:
                user = await self.get_user_from_jwt(token)

        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user = user
        self.group_name = f'notificaciones_rol_{user.rol_id}' if user.rol_id else f'notificaciones_user_{user.id}'

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        no_leidas = await self.get_no_leidas(user)
        await self.send(text_data=json.dumps({
            'tipo': 'no_leidas',
            'cantidad': no_leidas['cantidad'],
            'notificaciones': no_leidas['lista'],
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        accion = data.get('accion')
        user = getattr(self, 'user', self.scope.get('user'))

        if accion == 'marcar_leida':
            await self.marcar_leida(data.get('id'))
            no_leidas = await self.get_no_leidas(user)
            await self.send(text_data=json.dumps({
                'tipo': 'no_leidas',
                'cantidad': no_leidas['cantidad'],
                'notificaciones': no_leidas['lista'],
            }))
        elif accion == 'marcar_todas_leidas':
            await self.marcar_todas_leidas(user)
            await self.send(text_data=json.dumps({'tipo': 'no_leidas', 'cantidad': 0, 'notificaciones': []}))

    async def nueva_notificacion(self, event):
        await self.send(text_data=json.dumps({
            'tipo': 'nueva_notificacion',
            'notificacion': event['notificacion'],
        }))

    @database_sync_to_async
    def get_user_from_jwt(self, token):
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token)
            return jwt_auth.get_user(validated_token)
        except Exception:
            return None

    @database_sync_to_async
    def get_no_leidas(self, user):
        from .models import Notificacion
        qs = Notificacion.objects.filter(leida=False)
        if user.rol_id:
            qs = qs.filter(destinatario_rol_id=user.rol_id)
        else:
            qs = qs.filter(destinatario_usuario=user)
        lista = list(qs.values('id', 'titulo', 'mensaje', 'tipo__codigo', 'tipo__nombre', 'creada')[:20])
        for n in lista:
            n['creada'] = n['creada'].isoformat()
        return {'cantidad': qs.count(), 'lista': lista}

    @database_sync_to_async
    def marcar_leida(self, notificacion_id):
        from .models import Notificacion
        Notificacion.objects.filter(id=notificacion_id).update(leida=True)

    @database_sync_to_async
    def marcar_todas_leidas(self, user):
        from .models import Notificacion
        qs = Notificacion.objects.filter(leida=False)
        if user.rol_id:
            qs = qs.filter(destinatario_rol_id=user.rol_id)
        else:
            qs = qs.filter(destinatario_usuario=user)
        qs.update(leida=True)
