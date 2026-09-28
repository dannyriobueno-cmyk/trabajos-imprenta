// Abre cualquier pieza con ?guias para ver el corte (rosa) y la zona segura (azul).
if (new URLSearchParams(location.search).has("guias")) {
  document.documentElement.classList.add("guias");
}
