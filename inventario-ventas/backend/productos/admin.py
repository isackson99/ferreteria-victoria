from django.contrib import admin
from .models import Categoria, Producto, Kit, KitComponente


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'activa']
    search_fields = ['nombre']


class KitComponenteInline(admin.TabularInline):
    model = KitComponente
    extra = 1
    fk_name = 'kit'


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'codigo', 'tipo', 'precio_venta', 'inventario_actual', 'activo']
    list_filter = ['categoria', 'tipo', 'activo']
    search_fields = ['nombre', 'codigo']


@admin.register(Kit)
class KitAdmin(admin.ModelAdmin):
    list_display = ['producto', 'descripcion_promo']
    inlines = [KitComponenteInline]