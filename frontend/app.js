'use strict';

// --- Seguridad: todo texto externo pasa por esc() antes de entrar al DOM (RNF-03) ---
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Solo se permiten enlaces http(s); evita javascript: y similares
function urlSegura(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : '';
  } catch { return ''; }
}

const $ = (s) => document.querySelector(s);
const el = {
  form: $('#form'), res: $('#resultados'), titulo: $('#titulo-panel'), btnBuscar: $('#btn-buscar'),
  cuenta: $('#cuenta'), btnFav: $('#btn-favoritos'), dlg: $('#dlg-auth'), formAuth: $('#form-auth'),
};
const estado = { usuario: null, favoritos: [], resultados: [], vista: 'busqueda', modoRegistro: false };

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Error inesperado.'), { status: r.status });
  return datos;
}

// --- Estados del panel: inicio / cargando / resultados / vacío / error ---
function mostrarAviso(titulo, texto, esError = false) {
  el.res.innerHTML = `<div class="aviso ${esError ? 'es-error' : ''}" role="${esError ? 'alert' : 'status'}"><h3>${esc(titulo)}</h3><p>${esc(texto)}</p></div>`;
}
function mostrarCargando() {
  el.res.innerHTML = '<div class="lista" aria-busy="true"><div class="esqueleto"></div><div class="esqueleto"></div><div class="esqueleto"></div></div>';
}
function pintarInicio() {
  el.titulo.textContent = 'Resultados';
  mostrarAviso('Empezá tu búsqueda', 'Elegí un destino y los filtros que necesites. Te mostramos ofertas reales de otros sitios.');
}
function pintarResultados() {
  el.titulo.textContent = 'Resultados';
  el.res.innerHTML = `<ul class="lista">${estado.resultados.map(tarjetaResultado).join('')}</ul>`;
}
function pintarFavoritos() {
  el.titulo.textContent = 'Mis favoritos';
  if (!estado.favoritos.length) return mostrarAviso('Todavía no guardaste alojamientos', 'Buscá un destino y tocá "Guardar" en las ofertas que te gusten.');
  el.res.innerHTML = `<ul class="lista">${estado.favoritos.map(tarjetaFavorito).join('')}</ul>`;
}
function pintarVistaActual() {
  if (estado.vista === 'favoritos') pintarFavoritos();
  else if (estado.resultados.length) pintarResultados();
  else pintarInicio();
}

const esFavorito = (url) => estado.favoritos.find((f) => f.urlOrigen === url);

function tarjetaResultado(r, i) {
  const url = urlSegura(r.url);
  const host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  const img = urlSegura(r.imagen);
  const fav = esFavorito(r.url);
  return `<li class="tarjeta">
    ${img ? `<img class="foto" src="${esc(img)}" alt="${esc(r.nombre)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="foto">Sin imagen</div>'}
    <div class="cuerpo">
      <h3>${esc(r.nombre)}</h3>
      <span class="origen">Oferta de ${esc(host)}</span>
      <p>${esc(r.descripcion)}</p>
      <div class="etiquetas">${(r.servicios || []).map((s) => `<span class="etiqueta">${esc(s)}</span>`).join('')}</div>
    </div>
    <div class="lateral">
      <div class="precio"><strong>${esc(r.precio)}</strong>${r.precio !== 'No disponible' ? '<span>por noche</span>' : ''}</div>
      <button class="fav" data-accion="fav" data-i="${i}" aria-pressed="${fav ? 'true' : 'false'}">${fav ? '♥ Guardado' : '♡ Guardar'}</button>
      ${url ? `<a class="ver" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver oferta</a>` : ''}
    </div>
  </li>`;
}

function tarjetaFavorito(f) {
  const url = urlSegura(f.urlOrigen);
  const img = urlSegura(f.imagenUrl);
  return `<li class="tarjeta">
    ${img ? `<img class="foto" src="${esc(img)}" alt="${esc(f.nombreAlojamiento)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="foto">Sin imagen</div>'}
    <div class="cuerpo"><h3>${esc(f.nombreAlojamiento)}</h3><span class="origen">Guardado el ${esc(new Date(f.fechaGuardado).toLocaleDateString('es-AR'))}</span></div>
    <div class="lateral">
      <div class="precio"><strong>${f.precio != null ? esc(f.precio) : 'No disponible'}</strong></div>
      <button class="fav quitar" data-accion="quitar" data-id="${esc(f.id)}">Quitar</button>
      ${url ? `<a class="ver" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver oferta</a>` : ''}
    </div>
  </li>`;
}

// --- Búsqueda ---
el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(el.form);
  const cuerpo = {
    destino: d.get('destino').trim(),
    checkIn: d.get('checkIn') || undefined,
    checkOut: d.get('checkOut') || undefined,
    huespedes: Number(d.get('huespedes') || 1),
    precioMax: d.get('precioMax') ? Number(d.get('precioMax')) : undefined,
    servicios: d.getAll('servicios'),
  };
  estado.vista = 'busqueda';
  actualizarBotonFav();
  el.titulo.textContent = 'Resultados';
  el.btnBuscar.disabled = true;
  mostrarCargando();
  try {
    const r = await fetch('/metabuscar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const datos = await r.json();
    if (!datos.ok) return mostrarAviso('No pudimos buscar', datos.error || 'Error inesperado.', true);
    estado.resultados = datos.resultados;
    if (!datos.resultados.length) return mostrarAviso('Sin resultados', 'No encontramos alojamientos con esos filtros. Probá ampliar el precio o quitar algún servicio.');
    pintarResultados();
  } catch {
    mostrarAviso('Sin conexión', 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.', true);
  } finally {
    el.btnBuscar.disabled = false;
  }
});

// --- Acciones sobre tarjetas (delegación de eventos) ---
el.res.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion]');
  if (!b) return;
  try {
    if (b.dataset.accion === 'fav') {
      if (!estado.usuario) return abrirAuth(false);
      const r = estado.resultados[Number(b.dataset.i)];
      const existente = esFavorito(r.url);
      if (existente) await api(`/api/favoritos/${existente.id}`, { method: 'DELETE' });
      else await api('/api/favoritos', { method: 'POST', body: JSON.stringify({ nombre: r.nombre, precio: r.precioNumero, url: r.url, imagen: r.imagen }) });
      await cargarFavoritos();
      pintarResultados();
    } else if (b.dataset.accion === 'quitar') {
      await api(`/api/favoritos/${b.dataset.id}`, { method: 'DELETE' });
      await cargarFavoritos();
      pintarFavoritos();
    }
  } catch (err) { alert(err.message); }
});

async function cargarFavoritos() { estado.favoritos = (await api('/api/favoritos')).favoritos; }

el.btnFav.addEventListener('click', () => {
  estado.vista = estado.vista === 'favoritos' ? 'busqueda' : 'favoritos';
  actualizarBotonFav();
  pintarVistaActual();
});
function actualizarBotonFav() { el.btnFav.textContent = estado.vista === 'favoritos' ? 'Volver a la búsqueda' : 'Ver mis favoritos'; }

// --- Cuenta ---
function pintarCuenta() {
  if (estado.usuario) {
    el.cuenta.innerHTML = `<span>Hola, ${esc(estado.usuario.nombre)}</span><button class="enlace" id="btn-salir">Cerrar sesión</button>`;
    $('#btn-salir').onclick = async () => {
      await api('/api/auth/logout', { method: 'POST' });
      estado.usuario = null; estado.favoritos = []; estado.vista = 'busqueda';
      pintarCuenta(); pintarVistaActual();
    };
    el.btnFav.hidden = false;
  } else {
    el.cuenta.innerHTML = '<button class="enlace" id="btn-entrar">Iniciar sesión</button>';
    $('#btn-entrar').onclick = () => abrirAuth(false);
    el.btnFav.hidden = true;
  }
  actualizarBotonFav();
}

function abrirAuth(registro) {
  estado.modoRegistro = registro;
  $('#auth-titulo').textContent = registro ? 'Crear cuenta' : 'Iniciar sesión';
  $('#auth-enviar').textContent = registro ? 'Crear cuenta' : 'Entrar';
  $('#auth-cambiar').textContent = registro ? 'Ya tengo cuenta' : 'Crear una cuenta';
  $('#lbl-nombre').hidden = !registro;
  $('#auth-error').textContent = '';
  if (!el.dlg.open) el.dlg.showModal();
}
$('#auth-cambiar').onclick = () => abrirAuth(!estado.modoRegistro);
$('#auth-cerrar').onclick = () => el.dlg.close();

el.formAuth.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(el.formAuth));
  try {
    const r = await api(estado.modoRegistro ? '/api/auth/registro' : '/api/auth/login', { method: 'POST', body: JSON.stringify(d) });
    estado.usuario = r.usuario;
    await cargarFavoritos();
    el.formAuth.reset();
    el.dlg.close();
    pintarCuenta();
    pintarVistaActual();
  } catch (err) { $('#auth-error').textContent = err.message; }
});

// --- Inicio: fechas válidas, restaurar sesión y pantalla de bienvenida ---
(async function iniciar() {
  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  el.form.checkIn.min = hoy;
  el.form.checkOut.min = hoy;
  el.form.checkIn.addEventListener('change', () => { el.form.checkOut.min = el.form.checkIn.value || hoy; });
  try { estado.usuario = (await api('/api/auth/yo')).usuario; await cargarFavoritos(); } catch { /* sin sesión */ }
  pintarCuenta();
  pintarInicio();
})();
