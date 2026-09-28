# Trabajos de imprenta

Piezas impresas para clientes — volantes, tarjetas, pendones, carteles,
stickers — diseñadas **por código a su medida real** y exportadas listas para
el taller, con su hoja de trabajo.

## Empezar

```bash
npm install                       # una vez: instala Puppeteer (baja su Chrome)
```

## Un trabajo nuevo

```bash
node herramientas/nuevo.mjs "Panadería Sol" "Volante de octubre" volante-a5
```

Crea `clientes/panaderia-sol/2026-10-volante-de-octubre/` copiando la
plantilla. Ahí:

1. **Edita el HTML.** Ábrelo en el navegador para verlo; añade `?guias` a la
   dirección para ver el corte (rosa) y la zona segura (azul).
2. **Rellena `trabajo.json`:** medida, material, acabado, cantidad, caras.
3. **Exporta:**

```bash
node herramientas/exportar.mjs clientes/panaderia-sol/2026-10-volante-de-octubre
node herramientas/exportar.mjs --todo        # todos los trabajos
```

En `salida/` quedan:

| Archivo | Para qué |
|---|---|
| `…-IMPRENTA.pdf` | **Lo que se entrega.** Vectorial, con sangría, a medida exacta. |
| `…-IMPRENTA.png` | Lo mismo en imagen, a los ppp de `trabajo.json`, para el taller que no acepta PDF. |
| `…-REVISION.png` | Pequeña y con guías, para mandarle al cliente por WhatsApp. **No se imprime.** |
| `LEEME-IMPRENTA.txt` | Medida, material, acabado y cantidad. Va con los archivos al taller. |

## Lo que el exportador comprueba — y si falla, no exporta

- Ningún texto se sale de la zona segura.
- Ningún texto queda cortado dentro de su caja.
- La medida dibujada es la de `trabajo.json`.
- Las fuentes cargaron (si no, Chrome pondría otra sin avisar).

Si algo falla, solo deja el `-REVISION.png` para que se vea el problema: nunca
un `-IMPRENTA` malo en la carpeta de entregar.

## Cómo se arma una pieza

```html
<div class="pieza" style="--ancho: 14.8cm; --alto: 21cm;">
  <div class="fondo">   lo que llega al canto: colores, fotos          </div>
  <div class="seguro">  todo el texto y lo importante                 </div>
</div>
```

- `--sangria` (3 mm por defecto) y `--margen` (5 mm) se cambian por pieza.
- Varias `.pieza` en un HTML = varios archivos (p. ej. frente y reverso). Ponles
  `data-nombre="frente"`.
- Unidades de imprenta: `cm`, `mm`, `pt`. Nada en `px`.
- Fuentes: solo las de `herramientas/fuentes.css`, que están guardadas en el
  repo. Para añadir una, ver ese archivo.

## Plantillas

| Plantilla | Medida | Material sugerido | ppp |
|---|---|---|---|
| `volante-a5` | 14.8 × 21 cm | Glasé 150 g | 300 |
| `tarjeta` | 9 × 5.5 cm, frente y reverso | Opalina 250 g | 300 |
| `pendon` | 60 × 160 cm | Lona mate | 100 |

## Lo que NO va en el repo

- **`salida/`**: se regenera con el exportador.
- **`material/`** dentro de cada trabajo: fotos, logos y archivos que manda el
  cliente. Pesan, y no son nuestros para subirlos a GitHub. Guárdalos en Drive
  o en disco, y cópialos a `material/` cuando vayas a trabajar.
- `.psd`, `.ai`, `.indd`, `.cdr`, `.tif`.

## Límites

- **Color en RGB.** Si el taller pide CMYK con un perfil concreto, que
  convierta él y mande prueba impresa antes del tiraje.
- **Negro de texto:** un `#000` en RGB puede salir como negro de cuatro
  tintas (texto fino borroso si el registro se corre). Para texto pequeño,
  pídele al taller que lo pase a solo negro (K).
- Diseño por código: ideal para textos, maquetas y piezas que se repiten.
  Retoque de fotos o ilustración compleja se hace fuera y entra como imagen.
