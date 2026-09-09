/* Búsqueda en el navegador. Usa window.__RECIPES__ (assets/search-index.js). */
(function () {
  'use strict';

  var prefix = document.body.getAttribute('data-prefix') || '';
  var recipes = window.__RECIPES__ || [];

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function search(query) {
    var q = norm(query).trim();
    if (!q) return [];
    var terms = q.split(/\s+/);
    return recipes
      .map(function (r) {
        var haystack = norm(r.title + ' ' + r.categoryName + ' ' + (r.searchText || ''));
        var titleHay = norm(r.title);
        var score = 0;
        for (var i = 0; i < terms.length; i++) {
          if (haystack.indexOf(terms[i]) === -1) return null;
          if (titleHay.indexOf(terms[i]) !== -1) score += 2;
          else score += 1;
        }
        return { r: r, score: score };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.score - a.score || a.r.title.localeCompare(b.r.title, 'es');
      })
      .map(function (x) {
        return x.r;
      });
  }

  function render(results, query, container, status) {
    container.innerHTML = '';
    if (!query.trim()) {
      status.textContent = '';
      return;
    }
    status.textContent = results.length
      ? results.length + (results.length === 1 ? ' resultado encontrado' : ' resultados encontrados')
      : 'Sin resultados para “' + query + '”.';
    results.forEach(function (r) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = prefix + r.url;
      var meta = [r.categoryName, r.prep_time, r.difficulty].filter(Boolean).join(' · ');
      a.innerHTML =
        '<span class="rl-title"></span><span class="rl-meta"></span>';
      a.querySelector('.rl-title').textContent = r.title;
      a.querySelector('.rl-meta').textContent = meta;
      li.appendChild(a);
      container.appendChild(li);
    });
  }

  // Página de búsqueda dedicada
  var input = document.getElementById('search-input');
  var container = document.getElementById('search-results');
  var status = document.getElementById('search-status');
  var form = document.getElementById('search-form');

  if (input && container) {
    var initial = new URLSearchParams(location.search).get('q') || '';
    input.value = initial;
    var run = function () {
      render(search(input.value), input.value, container, status);
    };
    input.addEventListener('input', run);
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    run();
    input.focus();
  }

  // Filtro por dificultad en las páginas de categoría
  var bar = document.querySelector('[data-filter-bar]');
  var list = document.querySelector('[data-recipe-list]');
  var filterStatus = document.querySelector('[data-filter-status]');
  if (bar && list) {
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;
      var filter = btn.getAttribute('data-filter');
      bar.querySelectorAll('.filter-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      var visible = 0;
      list.querySelectorAll('li').forEach(function (li) {
        var hide = filter !== '' && li.getAttribute('data-difficulty') !== filter;
        li.hidden = hide;
        if (!hide) visible++;
      });
      if (filterStatus) {
        filterStatus.textContent = !filter
          ? ''
          : visible
          ? visible + (visible === 1 ? ' receta' : ' recetas')
          : 'Sin recetas de esa dificultad.';
      }
    });
  }
})();
