# Para quien trabaje en este repo (personas o Claude)

- Cada trabajo vive en `clientes/<cliente>/<AAAA-MM>-<trabajo>/` con su HTML y
  `trabajo.json`. Se crea con `node herramientas/nuevo.mjs`, no a mano.
- Toda pieza se mide en cm/mm/pt y sigue la estructura `.pieza > .fondo + .seguro`
  de `herramientas/base.css`.
- Antes de dar un trabajo por terminado: `node herramientas/exportar.mjs <carpeta>`
  tiene que acabar en «✓ Todo listo». Mira el `-REVISION.png`: el exportador no
  detecta texto del mismo color que su fondo.
- No subir `salida/`, `material/` ni archivos de diseño pesados.
- Sin Chrome de Puppeteer (p. ej. en la nube): `CHROME_PATH=/ruta/a/chrome`.
