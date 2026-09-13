/**
 * Generador del recetario.
 *
 * Lee los archivos Markdown de recetas/ (una subcarpeta por categoría) y
 * genera un sitio estático en dist/. Sin dependencias: solo Node.
 *
 *   node build.js            → genera el sitio una vez
 *   node build.js --watch    → regenera al detectar cambios
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = path.join(ROOT, 'recetas');
const GUIDES_DIR = path.join(ROOT, 'guias');
const SRC_DIR = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

/** Categorías del recetario. Para añadir una nueva, agrega una entrada aquí
 *  y crea la subcarpeta correspondiente dentro de recetas/. */
const CATEGORIES = [
  { slug: 'desayunos', name: 'Desayunos', blurb: 'Para empezar el día.' },
  { slug: 'snacks', name: 'Snacks', blurb: 'Merienda, pre-entreno y pre-cama.' },
  { slug: 'entrantes', name: 'Entrantes', blurb: 'Primeros y picoteo.' },
  { slug: 'principales', name: 'Principales', blurb: 'El plato fuerte.' },
  { slug: 'sandwiches', name: 'Sándwiches', blurb: 'Fríos y calientes, para cualquier momento.' },
  { slug: 'postres', name: 'Postres', blurb: 'El final feliz.' },
  { slug: 'bebidas', name: 'Bebidas', blurb: 'Con y sin alcohol.' },
  { slug: 'salsas', name: 'Salsas', blurb: 'Acompañar y aliñar.' },
];
const CATEGORY_BY_SLUG = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Formato en línea muy básico: **negrita**, *cursiva*, `código`, [texto](url). */
function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^\w])_([^_\n]+)_/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

/** Convierte un bloque de líneas Markdown en HTML (párrafos, listas). */
function renderBlocks(lines) {
  const html = [];
  let list = null; // { type: 'ul' | 'ol', items: [] }
  let para = [];

  const flushPara = () => {
    if (para.length) {
      html.push('<p>' + inline(para.join(' ')) + '</p>');
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(
        `<${list.type}>` +
          list.items.map((i) => `<li>${inline(i)}</li>`).join('') +
          `</${list.type}>`
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    let m;
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(m[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join('\n');
}

// ---------------------------------------------------------------------------
// Parseo de recetas
// ---------------------------------------------------------------------------

/** Parser mínimo de frontmatter YAML (solo lo que usa la plantilla). */
function parseFrontmatter(raw) {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };

  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const mm = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!mm) continue;

    const key = mm[1];
    let val = mm[2];
    if (!/^["'[]/.test(val.trim())) val = val.replace(/\s+#.*$/, ''); // comentario final
    val = val.trim();

    if (val === '') {
      data[key] = '';
    } else if (/^\[.*\]$/.test(val)) {
      const inner = val.slice(1, -1).trim();
      data[key] = inner
        ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : [];
    } else if (/^".*"$/.test(val) || /^'.*'$/.test(val)) {
      data[key] = val.slice(1, -1);
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      data[key] = Number(val);
    } else {
      data[key] = val;
    }
  }
  return { data, body: m[2] };
}

/** Divide el cuerpo en secciones por encabezados `## Nombre`. */
function parseSections(body) {
  const sections = {};
  let current = null;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^##\s+(.*)$/);
    if (m) {
      current = m[1].trim().toLowerCase();
      sections[current] = [];
    } else if (current) {
      sections[current].push(raw);
    }
  }
  return sections;
}

function listItems(lines = []) {
  return lines
    .map((l) => l.trim())
    .filter((l) => /^[-*\d]/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''));
}

/** Aplana un bloque Markdown a texto plano, para indexar en el buscador. */
function stripMd(lines = []) {
  return lines
    .join(' ')
    .replace(/[#*_`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function walkMarkdown(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function loadRecipes() {
  const files = walkMarkdown(RECIPES_DIR);
  const recipes = [];
  const problems = [];

  for (const file of files) {
    const rel = path.relative(RECIPES_DIR, file).split(path.sep);
    const categorySlug = rel[0];
    const slug = path.basename(file, '.md');
    const raw = fs.readFileSync(file, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const sections = parseSections(body);

    if (!CATEGORY_BY_SLUG[categorySlug]) {
      problems.push(`· ${path.relative(ROOT, file)}: carpeta "${categorySlug}" no es una categoría conocida.`);
      continue;
    }
    if (!data.title) {
      problems.push(`· ${path.relative(ROOT, file)}: falta "title" en el frontmatter.`);
      continue;
    }
    if (data.category && data.category !== categorySlug) {
      problems.push(
        `· ${path.relative(ROOT, file)}: category "${data.category}" no coincide con la carpeta "${categorySlug}".`
      );
    }

    recipes.push({
      slug,
      categorySlug,
      category: CATEGORY_BY_SLUG[categorySlug],
      title: data.title,
      servings: data.servings ?? null,
      prep_time: data.prep_time ?? '',
      difficulty: data.difficulty ?? '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      image: data.image ?? null, // reservado para el futuro; no se usa aún
      ingredients: listItems(sections['ingredientes']),
      ingredientsHtml: renderBlocks(sections['ingredientes'] || []),
      stepsHtml: renderBlocks(sections['pasos'] || []),
      notesHtml: sections['notas'] ? renderBlocks(sections['notas']) : '',
      url: `recetas/${categorySlug}/${slug}/index.html`,
    });
  }

  recipes.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return { recipes, problems };
}

/** Divide el cuerpo de una guía en introducción (texto antes del primer
 *  encabezado `##`) y las secciones que le siguen (mismo formato libre). */
function splitIntro(body) {
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !/^##\s+/.test(lines[i])) i++;
  return { introLines: lines.slice(0, i), rest: lines.slice(i).join('\n') };
}

/** Como parseSections, pero conserva el texto original (con mayúsculas) de
 *  cada encabezado en vez de devolverlo en minúsculas como clave. */
function splitGuideSections(body) {
  const sections = [];
  let current = null;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^##\s+(.*)$/);
    if (m) {
      current = { heading: m[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(raw);
    }
  }
  return sections;
}

function loadGuides() {
  const files = walkMarkdown(GUIDES_DIR);
  const guides = [];
  const problems = [];

  for (const file of files) {
    const rel = path.relative(GUIDES_DIR, file);
    if (rel.includes(path.sep)) {
      problems.push(`· ${path.relative(ROOT, file)}: las guías van directamente en guias/, sin subcarpetas.`);
    }
    const slug = path.basename(file, '.md');
    const raw = fs.readFileSync(file, 'utf8');
    const { data, body } = parseFrontmatter(raw);

    if (!data.title) {
      problems.push(`· ${path.relative(ROOT, file)}: falta "title" en el frontmatter.`);
      continue;
    }

    const { introLines, rest } = splitIntro(body);
    const sections = splitGuideSections(rest).map(({ heading, lines }) => ({
      heading,
      html: renderBlocks(lines),
      text: stripMd(lines),
    }));

    guides.push({
      slug,
      title: data.title,
      tags: Array.isArray(data.tags) ? data.tags : [],
      prep_time: data.time ?? '',
      difficulty: '',
      introHtml: renderBlocks(introLines),
      introText: stripMd(introLines),
      sections,
      url: `guias/${slug}/index.html`,
    });
  }

  guides.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return { guides, problems };
}

// ---------------------------------------------------------------------------
// Plantillas HTML
// ---------------------------------------------------------------------------

/** Versión de los assets (?v=…) para invalidar la caché del navegador en
 *  cada despliegue que cambie el CSS/JS. La fija build(). */
let ASSET_VER = 'dev';

function layout({ title, prefix, body, bodyClass = '' }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="Recetario de cocina personal.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Karla:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${prefix}assets/styles.css?v=${ASSET_VER}">
</head>
<body class="${bodyClass}" data-prefix="${prefix}">
<a class="skip-link" href="#contenido">Saltar al contenido</a>
<header class="site-header no-print">
  <a class="site-title" href="${prefix}index.html">El&nbsp;Recetario</a>
  <nav class="site-nav">
    ${CATEGORIES.map((c) => `<a href="${prefix}categorias/${c.slug}/index.html">${c.name}</a>`).join('')}
    <a href="${prefix}guias/index.html">Guías</a>
  </nav>
  <form class="site-search" role="search" action="${prefix}buscar.html" method="get">
    <input type="search" name="q" placeholder="Buscar…" aria-label="Buscar recetas">
  </form>
</header>
<main id="contenido">
${body}
</main>
<footer class="site-footer no-print">
  <p>Recetario personal · añade recetas en <code>recetas/</code> y guías en <code>guias/</code></p>
</footer>
<script src="${prefix}assets/search-index.js?v=${ASSET_VER}"></script>
<script src="${prefix}assets/app.js?v=${ASSET_VER}"></script>
</body>
</html>`;
}

function metaChips(r) {
  const chips = [];
  if (r.prep_time) chips.push(`<span class="chip">⏱ ${escapeHtml(r.prep_time)}</span>`);
  if (r.difficulty) chips.push(`<span class="chip chip--${escapeHtml(slugify(r.difficulty))}">◆ ${escapeHtml(r.difficulty)}</span>`);
  if (r.servings) chips.push(`<span class="chip">🍽 ${escapeHtml(r.servings)} raciones</span>`);
  return chips.join('');
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderHome(recipes, guides) {
  const total = recipes.length;
  const cards = CATEGORIES.map((c) => {
    const count = recipes.filter((r) => r.categorySlug === c.slug).length;
    return `<a class="cat-card" href="categorias/${c.slug}/index.html">
      <h3>${c.name}</h3>
      <p>${c.blurb}</p>
      <span class="cat-count">${count} ${count === 1 ? 'receta' : 'recetas'}</span>
    </a>`;
  }).join('\n');

  const latest = recipes.slice().sort((a, b) => a.title.localeCompare(b.title, 'es')).slice(0, 6);

  const body = `
<section class="hero">
  <p class="kicker">Cocina de casa</p>
  <h1>El Recetario</h1>
  <p class="lede">Una colección de recetas de la familia, escritas para que salgan bien
  siempre. ${total} ${total === 1 ? 'receta' : 'recetas'} y subiendo.</p>
</section>

<section class="section">
  <h2>Por categoría</h2>
  <div class="cat-grid">
${cards}
  </div>
</section>

<section class="section">
  <h2>Recetas</h2>
  <ul class="recipe-list">
${latest
  .map(
    (r) => `<li><a href="${r.url}"><span class="rl-title">${escapeHtml(r.title)}</span>
      <span class="rl-meta">${escapeHtml(r.category.name)}${r.prep_time ? ' · ' + escapeHtml(r.prep_time) : ''}</span></a></li>`
  )
  .join('\n')}
  </ul>
</section>

<section class="section">
  <h2>Guías</h2>
  <ul class="recipe-list">
${guides
  .map(
    (g) => `<li><a href="${g.url}"><span class="rl-title">${escapeHtml(g.title)}</span>
      <span class="rl-meta">${g.prep_time ? escapeHtml(g.prep_time) : ''}</span></a></li>`
  )
  .join('\n')}
  </ul>
</section>`;

  return layout({ title: 'El Recetario', prefix: '', body, bodyClass: 'page-home' });
}

const DIFFICULTIES = [
  { slug: 'facil', label: 'Fácil' },
  { slug: 'media', label: 'Media' },
  { slug: 'dificil', label: 'Difícil' },
];

function filterBar(list) {
  const present = new Set(list.map((r) => slugify(r.difficulty)).filter(Boolean));
  const opts = DIFFICULTIES.filter((d) => present.has(d.slug));
  if (opts.length < 2) return ''; // filtrar por una sola dificultad no aporta
  const btn = (filter, label, pressed) =>
    `<button type="button" class="filter-btn" data-filter="${filter}" aria-pressed="${pressed}">${label}</button>`;
  return `<div class="filter-bar no-print" data-filter-bar>
  ${btn('', 'Todas', 'true')}
  ${opts.map((d) => btn(d.slug, d.label, 'false')).join('\n  ')}
</div>`;
}

function renderCategory(category, recipes) {
  const list = recipes.filter((r) => r.categorySlug === category.slug);
  const body = `
<nav class="breadcrumb no-print"><a href="../../index.html">Inicio</a> › <span>${category.name}</span></nav>
<header class="page-head">
  <p class="kicker">Categoría</p>
  <h1>${category.name}</h1>
  <p class="lede">${category.blurb}</p>
</header>
${
  list.length
    ? `${filterBar(list)}
<ul class="recipe-list recipe-list--full" data-recipe-list>
${list
  .map(
    (r) => `<li data-difficulty="${slugify(r.difficulty)}"><a href="../../${r.url}">
      <span class="rl-title">${escapeHtml(r.title)}</span>
      <span class="rl-meta">${[r.prep_time, r.difficulty].filter(Boolean).map(escapeHtml).join(' · ')}</span>
    </a></li>`
  )
  .join('\n')}
</ul>
<p class="filter-status no-print" aria-live="polite" data-filter-status></p>`
    : `<p class="empty">Aún no hay recetas en esta categoría. Crea un archivo <code>.md</code> en <code>recetas/${category.slug}/</code>.</p>`
}`;
  return layout({ title: `${category.name} · El Recetario`, prefix: '../../', body, bodyClass: 'page-category' });
}

function renderRecipe(r) {
  const prefix = '../../../';
  const body = `
<nav class="breadcrumb no-print">
  <a href="${prefix}index.html">Inicio</a> ›
  <a href="${prefix}categorias/${r.categorySlug}/index.html">${r.category.name}</a> ›
  <span>${escapeHtml(r.title)}</span>
</nav>

<article class="recipe">
  <header class="recipe-head">
    <p class="kicker">${r.category.name}</p>
    <h1>${escapeHtml(r.title)}</h1>
    <div class="recipe-meta">${metaChips(r)}</div>
    ${r.tags.length ? `<div class="tags no-print">${r.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <button type="button" class="btn-print no-print" onclick="window.print()">Imprimir receta</button>
  </header>

  <div class="recipe-body">
    <section class="recipe-ingredients">
      <h2>Ingredientes</h2>
      ${r.ingredientsHtml || '<p class="empty">—</p>'}
    </section>

    <section class="recipe-steps">
      <h2>Pasos</h2>
      ${r.stepsHtml || '<p class="empty">—</p>'}
    </section>

    ${
      r.notesHtml
        ? `<section class="recipe-notes">
      <h2>Notas</h2>
      ${r.notesHtml}
    </section>`
        : ''
    }
  </div>
</article>`;
  return layout({ title: `${r.title} · El Recetario`, prefix, body, bodyClass: 'page-recipe' });
}

function renderGuidesIndex(guides) {
  const body = `
<nav class="breadcrumb no-print"><a href="../index.html">Inicio</a> › <span>Guías</span></nav>
<header class="page-head">
  <p class="kicker">Guías</p>
  <h1>Guías de cocina</h1>
  <p class="lede">Técnicas y trucos que no son una receta en sí, pero que ayudan con muchas.</p>
</header>
${
  guides.length
    ? `<ul class="recipe-list recipe-list--full">
${guides
  .map(
    (g) => `<li><a href="../${g.url}">
      <span class="rl-title">${escapeHtml(g.title)}</span>
      <span class="rl-meta">${g.prep_time ? escapeHtml(g.prep_time) : ''}</span>
    </a></li>`
  )
  .join('\n')}
</ul>`
    : `<p class="empty">Aún no hay guías. Crea un archivo <code>.md</code> en <code>guias/</code>.</p>`
}`;
  return layout({ title: 'Guías · El Recetario', prefix: '../', body, bodyClass: 'page-guides' });
}

function renderGuide(g) {
  const prefix = '../../';
  const body = `
<nav class="breadcrumb no-print">
  <a href="${prefix}index.html">Inicio</a> ›
  <a href="${prefix}guias/index.html">Guías</a> ›
  <span>${escapeHtml(g.title)}</span>
</nav>

<article class="guide">
  <header class="guide-head">
    <p class="kicker">Guía</p>
    <h1>${escapeHtml(g.title)}</h1>
    <div class="guide-meta">${metaChips(g)}</div>
    ${g.tags.length ? `<div class="tags no-print">${g.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <button type="button" class="btn-print no-print" onclick="window.print()">Imprimir guía</button>
  </header>

  <div class="guide-body">
    ${g.introHtml ? `<div class="prose">${g.introHtml}</div>` : ''}
    ${g.sections
      .map(
        (s) => `<section>
      <h2>${escapeHtml(s.heading)}</h2>
      <div class="prose">${s.html}</div>
    </section>`
      )
      .join('\n')}
  </div>
</article>`;
  return layout({ title: `${g.title} · El Recetario`, prefix, body, bodyClass: 'page-guide' });
}

function renderSearchPage() {
  const body = `
<header class="page-head">
  <p class="kicker">Buscador</p>
  <h1>Buscar recetas</h1>
</header>
<form class="search-box" id="search-form" role="search">
  <input type="search" id="search-input" name="q" placeholder="Título o ingrediente…" autocomplete="off" aria-label="Buscar">
</form>
<p class="search-status" id="search-status" aria-live="polite"></p>
<ul class="recipe-list recipe-list--full" id="search-results"></ul>`;
  return layout({ title: 'Buscar · El Recetario', prefix: '', body, bodyClass: 'page-search' });
}

// ---------------------------------------------------------------------------
// Escritura del sitio
// ---------------------------------------------------------------------------

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function copyAssets() {
  const assetsDir = path.join(DIST, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  for (const name of ['styles.css', 'app.js']) {
    fs.copyFileSync(path.join(SRC_DIR, name), path.join(assetsDir, name));
  }
}

function buildSearchIndex(recipes, guides) {
  const recipeData = recipes.map((r) => ({
    type: 'recipe',
    title: r.title,
    category: r.categorySlug,
    categoryName: r.category.name,
    url: r.url,
    prep_time: r.prep_time,
    difficulty: r.difficulty,
    searchText: r.ingredients.join(' '),
  }));
  const guideData = guides.map((g) => ({
    type: 'guide',
    title: g.title,
    category: 'guias',
    categoryName: 'Guía',
    url: g.url,
    prep_time: g.prep_time,
    difficulty: '',
    searchText: [g.introText, ...g.sections.map((s) => s.text)].filter(Boolean).join(' '),
  }));
  return `window.__RECIPES__ = ${JSON.stringify([...recipeData, ...guideData])};\n`;
}

function build() {
  const start = Date.now();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const { recipes, problems: recipeProblems } = loadRecipes();
  const { guides, problems: guideProblems } = loadGuides();
  const problems = [...recipeProblems, ...guideProblems];

  const searchIndex = buildSearchIndex(recipes, guides);
  ASSET_VER = crypto
    .createHash('sha1')
    .update(fs.readFileSync(path.join(SRC_DIR, 'styles.css')))
    .update(fs.readFileSync(path.join(SRC_DIR, 'app.js')))
    .update(searchIndex)
    .digest('hex')
    .slice(0, 8);

  write(path.join(DIST, 'index.html'), renderHome(recipes, guides));
  write(path.join(DIST, 'buscar.html'), renderSearchPage());
  for (const category of CATEGORIES) {
    write(path.join(DIST, 'categorias', category.slug, 'index.html'), renderCategory(category, recipes));
  }
  for (const r of recipes) {
    write(path.join(DIST, 'recetas', r.categorySlug, r.slug, 'index.html'), renderRecipe(r));
  }
  write(path.join(DIST, 'guias', 'index.html'), renderGuidesIndex(guides));
  for (const g of guides) {
    write(path.join(DIST, 'guias', g.slug, 'index.html'), renderGuide(g));
  }

  copyAssets();
  write(path.join(DIST, 'assets', 'search-index.js'), searchIndex);
  write(path.join(DIST, '.nojekyll'), '');

  const ms = Date.now() - start;
  console.log(`✓ ${recipes.length} recetas · ${guides.length} guías · ${CATEGORIES.length} categorías · ${ms} ms → dist/`);
  if (problems.length) {
    console.log('\n⚠ Avisos:');
    for (const p of problems) console.log('  ' + p);
  }
}

function watch() {
  build();
  console.log('\n👀 Observando recetas/, guias/ y src/ … (Ctrl+C para salir)');
  let timer = null;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (e) {
        console.error('✗ Error al generar:', e.message);
      }
    }, 120);
  };
  for (const dir of [RECIPES_DIR, GUIDES_DIR, SRC_DIR]) {
    if (fs.existsSync(dir)) fs.watch(dir, { recursive: true }, trigger);
  }
}

if (process.argv.includes('--watch')) watch();
else build();
