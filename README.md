# El Recetario

Un libro de recetas personal como página web. Cada receta es un archivo de texto
(Markdown) dentro de `recetas/`. Un pequeño generador lee esos archivos y produce
un sitio web estático en `dist/`, con portada, índice por categorías, buscador y
una página por receta pensada también para imprimir.

Sin base de datos, sin servidor, sin dependencias: solo necesitas **Node.js**
(versión 18 o superior) para generar el sitio.

---

## Cómo verlo en local

```bash
node build.js      # genera el sitio en dist/
node serve.js      # sírvelo en http://localhost:4321
```

También puedes abrir `dist/index.html` directamente en el navegador con doble clic
(el buscador funciona igual porque el índice se guarda como archivo `.js`).

Mientras editas recetas, deja el generador vigilando los cambios:

```bash
node build.js --watch
```

Si prefieres los comandos de npm: `npm run build`, `npm run serve`, `npm run dev`.

---

## Cómo añadir una receta nueva

1. Copia `plantilla-receta.md`.
2. Guárdalo dentro de la subcarpeta de su categoría, en `recetas/`:

   ```
   recetas/
     desayunos/
     entrantes/
     principales/
     postres/
     bebidas/
     salsas/
   ```

3. Ponle nombre en *kebab-case*, igual que el título:
   `Tarta de manzana` → `tarta-de-manzana.md`.
4. Rellena la cabecera y el cuerpo (ver formato abajo).
5. Vuelve a ejecutar `node build.js` (o déjalo en modo `--watch`).

La receta aparece automáticamente en su categoría y en el buscador. No hay que
tocar ningún índice a mano.

### Formato de una receta

```markdown
---
title: "Nombre de la receta"
category: "postres"        # debe coincidir con la carpeta
servings: 4                # número de raciones
prep_time: "20 min"        # texto libre
difficulty: "fácil"        # fácil / media / difícil
tags: [rápido, horno]      # opcional
# image: "foto.jpg"        # opcional, reservado — todavía no se muestra
---

## Ingredientes

- ingrediente 1
- ingrediente 2

## Pasos

1. Paso uno
2. Paso dos

## Notas

Consejos y trucos. Borra esta sección entera si no hay notas.
```

Se admite formato sencillo dentro del texto: `**negrita**`, `*cursiva*`,
`` `código` `` y `[enlaces](https://…)`.

Si algo está mal (falta el `title`, la carpeta no es una categoría conocida, etc.),
`node build.js` lo avisa por consola y sigue con el resto.

---

## Cómo añadir una categoría nueva

1. Abre `build.js` y añade una entrada al array `CATEGORIES` (arriba del todo):

   ```js
   { slug: 'conservas', name: 'Conservas', blurb: 'Para guardar la temporada.' },
   ```

2. Crea la carpeta `recetas/conservas/`.
3. Regenera el sitio.

---

## Publicar en GitHub Pages

Este repo incluye un flujo de GitHub Actions (`.github/workflows/deploy.yml`) que
genera el sitio y lo publica en cada `push` a `main`.

1. Sube el proyecto a un repositorio de GitHub.
2. En **Settings → Pages**, en *Build and deployment*, elige **GitHub Actions**.
3. Cada vez que subas cambios, el sitio se actualiza solo.

Para desplegarlo en otro sitio (Netlify, un hosting propio, etc.), basta con
subir el contenido de `dist/` tal cual.

---

## Estructura del proyecto

```
build.js              Generador: Markdown → HTML estático
serve.js              Servidor local mínimo para previsualizar
plantilla-receta.md   Plantilla para copiar al crear una receta
recetas/              Las recetas, una subcarpeta por categoría
src/
  styles.css          Estilos del sitio
  app.js              Buscador (se ejecuta en el navegador)
dist/                 Sitio generado (no se versiona por defecto)
```

## Qué no incluye todavía (a propósito)

- Ajuste automático de raciones y cantidades.
- Generador de lista de la compra.
- Fotos de las recetas (el campo `image` está reservado en la cabecera, pero
  aún no se usa ni se muestra).
