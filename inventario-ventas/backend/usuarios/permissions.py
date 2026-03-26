from rest_framework.permissions import BasePermission


def permiso_requerido(codigo):
    """Factory que genera una clase de permiso para un código específico."""
    class PermisoEspecifico(BasePermission):
        def has_permission(self, request, view):
            if not request.user.is_authenticated:
                return False
            return request.user.tiene_permiso(codigo)
    PermisoEspecifico.__name__ = f'Permiso_{codigo}'
    return PermisoEspecifico


class EsAdmin(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.is_superuser or (
            request.user.rol and request.user.rol.nombre == 'Admin'
        )


class PuedeVender(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_vender')


class PuedeVerInventario(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_ver_inventario')


class PuedeAjustarInventario(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_ajustar_inventario')


class PuedeAbonar(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_abonar')


class PuedeVerCreditos(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_ver_creditos')


class PuedeCrearProductos(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_crear_productos')


class PuedeCrearUsuarios(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_crear_usuarios')


class PuedeCancelarVentas(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.tiene_permiso('puede_cancelar_ventas')