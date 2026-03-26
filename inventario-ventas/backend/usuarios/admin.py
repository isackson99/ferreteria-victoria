from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Usuario, Rol, Permiso


@admin.register(Permiso)
class PermisoAdmin(admin.ModelAdmin):
    list_display = ['codigo', 'descripcion']
    search_fields = ['codigo', 'descripcion']


@admin.register(Rol)
class RolAdmin(admin.ModelAdmin):
    list_display = ['nombre']
    filter_horizontal = ['permisos']


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ['username', 'email', 'rol', 'is_active']
    list_filter = ['rol', 'is_active']
    fieldsets = UserAdmin.fieldsets + (
        ('Rol del sistema', {'fields': ('rol',)}),
    )