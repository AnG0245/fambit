# Tipografía de FAMBIT 0.3.0

Esta versión utiliza **Inter** en la interfaz del complemento y en el portal de administración. Reemplaza a Nunito Sans de 0.2.0 para dar al catálogo una apariencia más sobria y compacta. La fuente se incorpora al paquete; no requiere instalarla en Windows ni descargarla desde Google durante el uso.

- [Archivo original de Google Fonts](https://github.com/google/fonts/blob/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf).
- Git blob SHA-1 del original descargado: `047c92f6e2212473dc436020afed689527076d44`.
- [Licencia SIL Open Font License 1.1 de Inter](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt). Se conservan los créditos y la licencia en `public/fonts/OFL-Inter.txt` y `revit/NubeBIM/Fonts/OFL-Inter.txt`.

El portal sirve `public/fonts/Inter-Variable.ttf` con `font-display: swap`. Para WPF se crearon variantes estáticas Regular 400, Medium 500, SemiBold 600 y Bold 700 con `fontTools.varLib.instancer`, fijando el eje óptico `opsz` en 14. Las tablas de nombres identifican la familia Inter y el estilo correspondiente. Son archivos derivados del original, sin cambios manuales a los contornos de las letras.

Las cuatro variantes y la licencia se incorporan como recursos del ensamblado. El instalador también copia la licencia como archivo de texto junto al complemento. Los ZIP anteriores conservan su tipografía y sus licencias originales.

Los títulos y el nombre FAMBIT usan mayor peso, sin un tamaño dominante. La jerarquía se apoya en tamaño, peso, espaciado y contraste. Las animaciones de los controles respetan la preferencia de Windows `SystemParameters.ClientAreaAnimation`; el portal respeta `prefers-reduced-motion`.
