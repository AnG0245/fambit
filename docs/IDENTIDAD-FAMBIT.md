# Identidad y organización de FAMBIT 0.3.0

Se tomó la captura aportada por el usuario como referencia de organización: navegación vertical, búsqueda superior, rastro de categorías, contador de resultados y tarjetas compactas con imagen. El icono, la tipografía y la composición se prepararon para FAMBIT; no se incorporaron familias ni miniaturas del catálogo de la captura.

La interfaz usa fondo blanco, bordes finos, grises suaves y el nombre FAMBIT en negro. Los cambios de categoría dejan de recolorear superficies grandes. Biblioteca, Categorías y Actualizar se sitúan arriba en la barra lateral; Cuenta queda abajo y reúne sesión y actualizaciones. El catálogo tiene dos tamaños de tarjeta y adaptación de columnas al ancho disponible.

## Icono

El símbolo reúne planos oscuros separados que sugieren un volumen isométrico y componentes modulares. Se generó una imagen con la herramienta integrada `image_gen`, se inspeccionó y se conservó sin edición manual.

Archivos de integración: `public/brand/fambit-mark.png` y `revit/NubeBIM/Assets/fambit-mark.png`. Son copias del mismo PNG RGBA de 1254 × 1254 píxeles con transparencia real. El complemento lo incorpora a su cabecera y a su botón en la cinta de Revit; el portal lo usa en su identidad y pestaña del navegador. La escala se adapta al presentar el recurso, sin modificar el original.

Prompt utilizado:

```text
Use case: logo-brand
Asset type: original FAMBIT logo icon for a professional Revit BIM family library, used in an add-in and web portal.
Primary request: create ONE sophisticated minimal geometric symbol suggesting an isometric 3D modular building block or grouped architectural family components. An F-shaped negative space may be integrated naturally into the geometry.
Style/medium: crisp, vector-like flat monochrome logo, strong precision and considered optical balance. Substantial strokes or planes that remain readable at 24–32 pixels.
Composition/framing: one centered icon only on a square high-resolution 1024×1024 transparent PNG, with modest, balanced margins. Compact silhouette; simple construction, clean joins, no tiny details.
Color palette: solid near-black #151719 for the entire symbol; genuinely transparent background with preserved alpha channel.
Text: no text, no wordmark, no lettering separate from the geometric symbol.
Constraints: create an original identity; do not copy existing BIM brands. No gradient, no shading, no shadow, no mockup, no colored background tile, no border, no secondary symbols, no presentation sheet.
```

La instrucción solicitaba 1024 × 1024; el archivo recibido tiene 1254 × 1254. La integración conserva esa resolución. La referencia visual del usuario no era una imagen a editar: la generación se hizo desde el brief del símbolo.
