/* ============================================================
   INTELLIGENT NUTRITION - Lógica de frontend
   ============================================================ */

let productos = [];
let carrito = []; // { codigo, nombre, precio, cantidad }
let categoriaActual = "Todos";
let terminoBusqueda = "";
let turnoActivo = null;
let usuarioActual = null;
let compradorSeleccionado = null;
let descuentoAplicado = { tipo: "porcentaje", valor: 0 };
let metodoPagoSeleccionado = "Efectivo";
let productoSeleccionadoInventario = null;

const API = {
  session: "/api/session",
  login: "/api/login",
  logout: "/api/logout",
  productos: "/api/productos",
  usuarios: "/api/usuarios",
  compradores: "/api/compradores",
  recetas: "/api/recetas",
  turnoIniciar: "/api/turno/iniciar",
  turnoCerrar: "/api/turno/cerrar",
  turnoActual: "/api/turno/actual",
  turnoHistorial: "/api/turno/historial",
  pedidos: "/api/pedidos",
  sync: "/api/sync",
};

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try { data = await resp.json(); } catch (e) { data = null; }
  if (!resp.ok) {
    const msg = (data && data.error) ? data.error : `Error ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  actualizarFecha();
  document.getElementById("loginForm").addEventListener("submit", onLoginSubmit);
  verificarSesion();
});

function actualizarFecha() {
  const el = document.getElementById("fechaActual");
  if (!el) return;
  const ahora = new Date();
  el.textContent = ahora.toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

async function verificarSesion() {
  try {
    const data = await apiFetch(API.session);
    usuarioActual = data;
    turnoActivo = data.turno_actual;
    mostrarApp();
  } catch (e) {
    mostrarLogin();
  }
}

function mostrarLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("mainApp").style.display = "none";
}

async function mostrarApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "block";
  document.getElementById("userInfo").textContent = `👤 ${usuarioActual.nombre}`;
  document.getElementById("rolBadge").textContent = usuarioActual.rol;

  const esAdmin = usuarioActual.rol === "Administrador";
  document.querySelectorAll(".btn-admin").forEach(btn => {
    btn.style.display = esAdmin ? "inline-block" : "none";
  });

  actualizarBotonTurno();
  await cargarProductos();
  actualizarCarritoUI();
}

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */
async function onLoginSubmit(ev) {
  ev.preventDefault();
  const usuario = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  try {
    await apiFetch(API.login, {
      method: "POST",
      body: JSON.stringify({ usuario, password }),
    });
    await verificarSesion();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function logout() {
  try { await apiFetch(API.logout, { method: "POST" }); } catch (e) { /* ignore */ }
  usuarioActual = null;
  turnoActivo = null;
  carrito = [];
  mostrarLogin();
}

/* ============================================================
   PRODUCTOS
   ============================================================ */
async function cargarProductos() {
  try {
    productos = await apiFetch(API.productos);
    renderProductos();
    actualizarEstadisticas();
  } catch (e) {
    setStatus("❌ No se pudieron cargar los productos: " + e.message);
  }
}

function productosFiltrados() {
  return productos.filter(p => {
    const pasaCategoria = categoriaActual === "Todos" || p.categoria === categoriaActual;
    const pasaBusqueda = !terminoBusqueda || p.nombre.toLowerCase().includes(terminoBusqueda) || p.codigo.toLowerCase().includes(terminoBusqueda);
    return pasaCategoria && pasaBusqueda;
  });
}

function renderProductos() {
  const grid = document.getElementById("productosGrid");
  const lista = productosFiltrados();
  grid.innerHTML = "";

  if (lista.length === 0) {
    grid.innerHTML = `<p style="color:#5b6b64;grid-column:1/-1;text-align:center;padding:30px;">No hay productos que coincidan.</p>`;
    return;
  }

  lista.forEach(p => {
    const precioFinal = p.venta * (1 - (p.descuento || 0) / 100);
    const sinStock = p.stock <= 0;
    const card = document.createElement("div");
    card.className = "producto-card";
    card.innerHTML = `
      ${p.descuento > 0 ? `<span class="badge-descuento">-${p.descuento}%</span>` : ""}
      <span class="cat-tag">${p.categoria}</span>
      <span class="nombre">${p.nombre}</span>
      <span class="precio">$${formatoMoneda(precioFinal)}${p.descuento > 0 ? `<span class="precio-original">$${formatoMoneda(p.venta)}</span>` : ""}</span>
      <span class="stock ${p.stock <= 3 ? "bajo" : ""}">${sinStock ? "Sin stock" : `Stock: ${p.stock}`}</span>
      <button ${sinStock ? "disabled" : ""} onclick="agregarAlCarrito('${p.codigo}')">${sinStock ? "No disponible" : "➕ Agregar"}</button>
    `;
    grid.appendChild(card);
  });
}

function filtrarProductos(categoria) {
  categoriaActual = categoria;
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filtro === categoria);
  });
  renderProductos();
}

function buscarProductos() {
  terminoBusqueda = document.getElementById("searchInput").value.trim().toLowerCase();
  renderProductos();
  const resultados = document.getElementById("searchResults");
  if (terminoBusqueda) {
    resultados.textContent = `${productosFiltrados().length} resultado(s)`;
  } else {
    resultados.textContent = "";
  }
}

function actualizarEstadisticas() {
  document.getElementById("statsProductos").textContent = `📦 ${productos.length} productos`;
}

function setStatus(msg) {
  document.getElementById("statusLabel").textContent = msg;
  setTimeout(() => { document.getElementById("statusLabel").textContent = "✅ Listo"; }, 3500);
}

/* ============================================================
   CARRITO
   ============================================================ */
function agregarAlCarrito(codigo) {
  const producto = productos.find(p => p.codigo === codigo);
  if (!producto || producto.stock <= 0) return;

  const item = carrito.find(i => i.codigo === codigo);
  const enCarrito = item ? item.cantidad : 0;
  if (enCarrito >= producto.stock) {
    setStatus("⚠️ No hay más stock disponible de " + producto.nombre);
    return;
  }

  const precioFinal = producto.venta * (1 - (producto.descuento || 0) / 100);
  if (item) {
    item.cantidad += 1;
  } else {
    carrito.push({ codigo, nombre: producto.nombre, precio: precioFinal, cantidad: 1 });
  }
  actualizarCarritoUI();
}

function cambiarCantidad(codigo, delta) {
  const item = carrito.find(i => i.codigo === codigo);
  if (!item) return;
  const producto = productos.find(p => p.codigo === codigo);
  const nuevaCantidad = item.cantidad + delta;

  if (nuevaCantidad <= 0) {
    quitarDelCarrito(codigo);
    return;
  }
  if (producto && nuevaCantidad > producto.stock) {
    setStatus("⚠️ No hay más stock disponible");
    return;
  }
  item.cantidad = nuevaCantidad;
  actualizarCarritoUI();
}

function quitarDelCarrito(codigo) {
  carrito = carrito.filter(i => i.codigo !== codigo);
  actualizarCarritoUI();
}

function vaciarCarrito() {
  carrito = [];
  actualizarCarritoUI();
}

function totalCarrito() {
  return carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
}

function actualizarCarritoUI() {
  const lista = document.getElementById("cartList");
  const count = carrito.reduce((s, i) => s + i.cantidad, 0);
  document.getElementById("cartCount").textContent = `${count} item${count !== 1 ? "s" : ""}`;

  if (carrito.length === 0) {
    lista.innerHTML = `
      <p class="cart-empty">🛒 Tu carrito está vacío</p>
      <p class="cart-empty-sub">Elige productos del menú</p>
    `;
  } else {
    lista.innerHTML = carrito.map(i => `
      <div class="cart-item">
        <div class="item-info">
          <div class="item-nombre">${i.nombre}</div>
          <div class="item-precio">$${formatoMoneda(i.precio)} c/u</div>
        </div>
        <div class="item-cantidad">
          <button onclick="cambiarCantidad('${i.codigo}', -1)">−</button>
          <span>${i.cantidad}</span>
          <button onclick="cambiarCantidad('${i.codigo}', 1)">+</button>
        </div>
        <button class="item-quitar" onclick="quitarDelCarrito('${i.codigo}')">✕</button>
      </div>
    `).join("");
  }
  document.getElementById("cartTotal").textContent = `$${formatoMoneda(totalCarrito())}`;
}

function formatoMoneda(valor) {
  return Math.round(valor).toLocaleString("es-CO");
}

/* ============================================================
   CHECKOUT
   ============================================================ */
function abrirCheckout() {
  if (carrito.length === 0) {
    setStatus("⚠️ Agrega productos antes de continuar");
    return;
  }
  if (!turnoActivo) {
    setStatus("⚠️ Debes iniciar un turno antes de vender");
    return;
  }
  descuentoAplicado = { tipo: "porcentaje", valor: 0 };
  document.getElementById("descuentoAdicional").value = 0;
  document.querySelector('input[name="tipoDescuento"][value="porcentaje"]').checked = true;
  metodoPagoSeleccionado = "Efectivo";
  document.querySelectorAll(".btn-pago").forEach(b => b.classList.toggle("active", b.dataset.pago === "Efectivo"));
  compradorSeleccionado = null;
  document.getElementById("checkoutNombre").value = "";
  document.getElementById("checkoutTelefono").value = "";
  document.getElementById("checkoutObservaciones").value = "";
  renderResumenCheckout();
  abrirModal("checkoutModal");
}

function cerrarCheckout() {
  cerrarModal("checkoutModal");
}

function renderResumenCheckout() {
  const cont = document.getElementById("checkoutResumen");
  cont.innerHTML = carrito.map(i => `
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;">
      <span>${i.cantidad} × ${i.nombre}</span>
      <span>$${formatoMoneda(i.precio * i.cantidad)}</span>
    </div>
  `).join("");
  actualizarTotalConDescuento();
}

function aplicarDescuento() {
  const tipo = document.querySelector('input[name="tipoDescuento"]:checked').value;
  const valor = parseFloat(document.getElementById("descuentoAdicional").value) || 0;
  descuentoAplicado = { tipo, valor };
  actualizarTotalConDescuento();
}

function actualizarTotalConDescuento() {
  const subtotal = totalCarrito();
  let total = subtotal;
  let etiqueta = "Sin descuento adicional";

  if (descuentoAplicado.valor > 0) {
    if (descuentoAplicado.tipo === "porcentaje") {
      total = subtotal * (1 - descuentoAplicado.valor / 100);
      etiqueta = `Descuento aplicado: ${descuentoAplicado.valor}%`;
    } else {
      total = Math.max(subtotal - descuentoAplicado.valor, 0);
      etiqueta = `Descuento aplicado: $${formatoMoneda(descuentoAplicado.valor)}`;
    }
  }

  document.getElementById("descuentoAplicadoLabel").textContent = etiqueta;
  document.getElementById("totalFinalLabel").textContent = `Total a pagar: $${formatoMoneda(total)}`;
}

function seleccionarPago(btn, metodo) {
  metodoPagoSeleccionado = metodo;
  document.querySelectorAll(".btn-pago").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

async function buscarComprador() {
  const telefono = document.getElementById("checkoutTelefono").value.trim();
  const nombre = document.getElementById("checkoutNombre").value.trim();
  const q = telefono || nombre;
  if (!q) {
    setStatus("⚠️ Escribe un nombre o teléfono para buscar");
    return;
  }
  try {
    const resultados = await apiFetch(`${API.compradores}?q=${encodeURIComponent(q)}`);
    if (resultados.length > 0) {
      compradorSeleccionado = resultados[0];
      document.getElementById("checkoutNombre").value = compradorSeleccionado.nombre;
      document.getElementById("checkoutTelefono").value = compradorSeleccionado.telefono || "";
      setStatus(`✅ Comprador encontrado: ${compradorSeleccionado.nombre}`);
    } else {
      compradorSeleccionado = null;
      setStatus("ℹ️ No se encontró el comprador, se creará uno nuevo al confirmar");
    }
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

async function confirmarPedido() {
  if (carrito.length === 0) return;

  const nombre = document.getElementById("checkoutNombre").value.trim();
  const telefono = document.getElementById("checkoutTelefono").value.trim();
  const observaciones = document.getElementById("checkoutObservaciones").value.trim();

  const payload = {
    items: carrito.map(i => ({ codigo: i.codigo, cantidad: i.cantidad })),
    descuento_adicional: descuentoAplicado,
    comprador: nombre ? { nombre, telefono } : null,
    metodo_pago: metodoPagoSeleccionado,
    observaciones,
  };

  try {
    if (nombre) {
      await apiFetch(API.compradores, {
        method: "POST",
        body: JSON.stringify({ nombre, telefono }),
      });
    }
    const data = await apiFetch(API.pedidos, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStatus(`✅ Pedido confirmado por $${formatoMoneda(data.venta.total)}`);
    carrito = [];
    actualizarCarritoUI();
    cerrarCheckout();
    await cargarProductos();
    await actualizarTurnoDesdeServidor();
    mostrarReciboDisponible(data.venta.id, data.venta.total);
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

function mostrarReciboDisponible(ventaId, total) {
  const url = `/api/pedidos/${ventaId}/recibo`;
  document.getElementById("reciboTotal").textContent = `Total: $${formatoMoneda(total)}`;
  document.getElementById("reciboVerBtn").onclick = () => window.open(url, "_blank");
  document.getElementById("reciboDescargarBtn").onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `recibo_${ventaId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  abrirModal("reciboModal");
  // Abre el PDF automáticamente en una pestaña nueva
  window.open(url, "_blank");
}

/* ============================================================
   MODALES genéricos
   ============================================================ */
function abrirModal(id) { document.getElementById(id).classList.add("open"); }
function cerrarModal(id) { document.getElementById(id).classList.remove("open"); }

/* ============================================================
   INVENTARIO
   ============================================================ */
function abrirGestionInventario() {
  renderTablaInventario();
  limpiarFormInventario();
  abrirModal("inventarioModal");
}
function cerrarInventario() { cerrarModal("inventarioModal"); }

function renderTablaInventario() {
  const tbody = document.getElementById("tablaInventarioBody");
  const filtro = (document.getElementById("buscarInventario").value || "").toLowerCase();
  const lista = productos.filter(p => !filtro || p.nombre.toLowerCase().includes(filtro) || p.codigo.toLowerCase().includes(filtro));

  tbody.innerHTML = lista.map(p => {
    const ganancia = p.venta - p.costo;
    const margen = p.venta > 0 ? (ganancia / p.venta * 100).toFixed(1) : "0.0";
    return `
      <tr onclick='seleccionarProductoInventario(${JSON.stringify(p.codigo)})'>
        <td>${p.codigo}</td>
        <td>${p.nombre}</td>
        <td>${p.categoria}</td>
        <td>$${formatoMoneda(p.costo)}</td>
        <td>$${formatoMoneda(p.venta)}</td>
        <td>$${formatoMoneda(ganancia)}</td>
        <td>${margen}%</td>
        <td>${p.stock}</td>
        <td>${p.descuento || 0}%</td>
      </tr>
    `;
  }).join("");
}

function filtrarInventario() { renderTablaInventario(); }

function seleccionarProductoInventario(codigo) {
  const p = productos.find(x => x.codigo === codigo);
  if (!p) return;
  productoSeleccionadoInventario = p;
  document.getElementById("invCodigo").value = p.codigo;
  document.getElementById("invNombre").value = p.nombre;
  document.getElementById("invCategoria").value = p.categoria;
  document.getElementById("invCosto").value = p.costo;
  document.getElementById("invVenta").value = p.venta;
  document.getElementById("invStock").value = p.stock;
  document.getElementById("invDescuento").value = p.descuento || 0;
  calcularGanancia();
}

function cargarProductoSeleccionado() {
  if (!productoSeleccionadoInventario) {
    setStatus("ℹ️ Selecciona primero un producto en la tabla");
    return;
  }
  seleccionarProductoInventario(productoSeleccionadoInventario.codigo);
}

function limpiarFormInventario() {
  productoSeleccionadoInventario = null;
  ["invCodigo", "invNombre"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("invCategoria").selectedIndex = 0;
  ["invCosto", "invVenta", "invStock", "invDescuento"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("invGanancia").value = "";
  document.getElementById("invMargen").value = "";
}

function calcularGanancia() {
  const costo = parseFloat(document.getElementById("invCosto").value) || 0;
  const venta = parseFloat(document.getElementById("invVenta").value) || 0;
  const ganancia = venta - costo;
  const margen = venta > 0 ? (ganancia / venta * 100).toFixed(1) : "0.0";
  document.getElementById("invGanancia").value = `$${formatoMoneda(ganancia)}`;
  document.getElementById("invMargen").value = `${margen}%`;
}

async function guardarProducto() {
  const producto = {
    codigo: document.getElementById("invCodigo").value.trim(),
    nombre: document.getElementById("invNombre").value.trim(),
    categoria: document.getElementById("invCategoria").value,
    costo: parseFloat(document.getElementById("invCosto").value) || 0,
    venta: parseFloat(document.getElementById("invVenta").value) || 0,
    stock: parseInt(document.getElementById("invStock").value) || 0,
    descuento: parseFloat(document.getElementById("invDescuento").value) || 0,
  };
  if (!producto.codigo || !producto.nombre) {
    setStatus("⚠️ Código y nombre son obligatorios");
    return;
  }
  try {
    await apiFetch(API.productos, { method: "POST", body: JSON.stringify(producto) });
    await cargarProductos();
    renderTablaInventario();
    setStatus("✅ Producto guardado");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

async function eliminarProducto() {
  const codigo = document.getElementById("invCodigo").value.trim();
  if (!codigo) return;
  if (!confirm(`¿Eliminar el producto ${codigo}?`)) return;
  try {
    await apiFetch(`${API.productos}/${encodeURIComponent(codigo)}`, { method: "DELETE" });
    await cargarProductos();
    renderTablaInventario();
    limpiarFormInventario();
    setStatus("🗑️ Producto eliminado");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

/* ============================================================
   USUARIOS
   ============================================================ */
async function abrirGestionUsuarios() {
  abrirModal("usuariosModal");
  await renderTablaUsuarios();
}

async function renderTablaUsuarios() {
  try {
    const usuarios = await apiFetch(API.usuarios);
    const tbody = document.getElementById("tablaUsuariosBody");
    tbody.innerHTML = usuarios.map(u => `
      <tr>
        <td>${u.usuario}</td>
        <td>${u.nombre}</td>
        <td>${u.rol}</td>
        <td><span class="tabla-eliminar" onclick="eliminarUsuario('${u.usuario}')">🗑️</span></td>
      </tr>
    `).join("");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

async function guardarUsuario() {
  const body = {
    usuario: document.getElementById("usrUsuario").value.trim(),
    nombre: document.getElementById("usrNombre").value.trim(),
    password: document.getElementById("usrPassword").value,
    rol: document.getElementById("usrRol").value,
  };
  if (!body.usuario) {
    setStatus("⚠️ El usuario es obligatorio");
    return;
  }
  try {
    await apiFetch(API.usuarios, { method: "POST", body: JSON.stringify(body) });
    await renderTablaUsuarios();
    document.getElementById("usrUsuario").value = "";
    document.getElementById("usrNombre").value = "";
    document.getElementById("usrPassword").value = "";
    setStatus("✅ Usuario guardado");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

async function eliminarUsuario(usuario) {
  if (!confirm(`¿Eliminar el usuario ${usuario}?`)) return;
  try {
    await apiFetch(`${API.usuarios}/${encodeURIComponent(usuario)}`, { method: "DELETE" });
    await renderTablaUsuarios();
    setStatus("🗑️ Usuario eliminado");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

/* ============================================================
   COMPRADORES
   ============================================================ */
async function abrirGestionCompradores() {
  abrirModal("compradoresModal");
  await renderTablaCompradores();
}

async function renderTablaCompradores(q = "") {
  try {
    const compradores = await apiFetch(`${API.compradores}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const tbody = document.getElementById("tablaCompradoresBody");
    tbody.innerHTML = compradores.map(c => `
      <tr>
        <td>${c.nombre}</td>
        <td>${c.telefono || "-"}</td>
        <td>${c.compras}</td>
        <td>$${formatoMoneda(c.total_gastado)}</td>
      </tr>
    `).join("") || `<tr><td colspan="4" style="text-align:center;color:#5b6b64;">Sin compradores registrados</td></tr>`;
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

function filtrarCompradores() {
  const q = document.getElementById("buscarCompradorInput").value.trim();
  renderTablaCompradores(q);
}

async function guardarComprador() {
  const nombre = document.getElementById("compNombre").value.trim();
  const telefono = document.getElementById("compTelefono").value.trim();
  if (!nombre) {
    setStatus("⚠️ El nombre es obligatorio");
    return;
  }
  try {
    await apiFetch(API.compradores, { method: "POST", body: JSON.stringify({ nombre, telefono }) });
    document.getElementById("compNombre").value = "";
    document.getElementById("compTelefono").value = "";
    await renderTablaCompradores();
    setStatus("✅ Comprador guardado");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

/* ============================================================
   RECETAS
   ============================================================ */
async function abrirGestionRecetas() {
  abrirModal("recetasModal");
  await renderTablaRecetas();
}

async function renderTablaRecetas() {
  try {
    const recetas = await apiFetch(API.recetas);
    const tbody = document.getElementById("tablaRecetasBody");
    tbody.innerHTML = recetas.map(r => `
      <tr>
        <td>${r.nombre}</td>
        <td>${(r.ingredientes || "").replace(/\n/g, ", ")}</td>
        <td><span class="tabla-eliminar" onclick="eliminarReceta('${r.id}')">🗑️</span></td>
      </tr>
    `).join("") || `<tr><td colspan="3" style="text-align:center;color:#5b6b64;">Sin recetas registradas</td></tr>`;
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

async function guardarReceta() {
  const nombre = document.getElementById("recNombre").value.trim();
  const ingredientes = document.getElementById("recIngredientes").value.trim();
  if (!nombre) {
    setStatus("⚠️ El nombre de la receta es obligatorio");
    return;
  }
  try {
    await apiFetch(API.recetas, { method: "POST", body: JSON.stringify({ nombre, ingredientes }) });
    document.getElementById("recNombre").value = "";
    document.getElementById("recIngredientes").value = "";
    await renderTablaRecetas();
    setStatus("✅ Receta guardada");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

async function eliminarReceta(id) {
  if (!confirm("¿Eliminar esta receta?")) return;
  try {
    await apiFetch(`${API.recetas}/${id}`, { method: "DELETE" });
    await renderTablaRecetas();
    setStatus("🗑️ Receta eliminada");
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

/* ============================================================
   TURNOS
   ============================================================ */
function actualizarBotonTurno() {
  const btn = document.getElementById("btnTurno");
  if (turnoActivo) {
    btn.textContent = "⏹️ Cerrar Turno";
    btn.classList.add("activo");
  } else {
    btn.textContent = "▶️ Iniciar Turno";
    btn.classList.remove("activo");
  }
}

async function actualizarTurnoDesdeServidor() {
  try {
    turnoActivo = await apiFetch(API.turnoActual);
  } catch (e) {
    turnoActivo = null;
  }
  actualizarBotonTurno();
  if (turnoActivo) {
    document.getElementById("statsVentas").textContent = `💰 $${formatoMoneda(turnoActivo.total_ventas)} vendidos`;
  } else {
    document.getElementById("statsVentas").textContent = "💰 $0 vendidos";
  }
}

async function gestionarTurno() {
  try {
    if (turnoActivo) {
      if (!confirm("¿Cerrar el turno actual?")) return;
      const data = await apiFetch(API.turnoCerrar, { method: "POST" });
      setStatus("✅ Turno cerrado");
      abrirReporteTurno(data.turno.id, data.turno.total_ventas, data.turno.cantidad_pedidos);
    } else {
      await apiFetch(API.turnoIniciar, { method: "POST" });
      setStatus("✅ Turno iniciado");
    }
    await actualizarTurnoDesdeServidor();
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

function abrirReporteTurno(turnoId, totalVentas, cantidadPedidos) {
  const url = `/api/turno/${turnoId}/reporte`;
  document.getElementById("reporteTurnoResumen").innerHTML = `
    ${cantidadPedidos} pedido${cantidadPedidos !== 1 ? "s" : ""} · Total vendido: $${formatoMoneda(totalVentas)}
  `;
  document.getElementById("reporteTurnoVerBtn").onclick = () => window.open(url, "_blank");
  document.getElementById("reporteTurnoDescargarBtn").onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_turno_${turnoId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  abrirModal("reporteTurnoModal");
  window.open(url, "_blank");
}

async function verHistorialTurnos() {
  abrirModal("historialModal");
  try {
    const historial = await apiFetch(API.turnoHistorial);
    const tbody = document.getElementById("tablaHistorialBody");
    tbody.innerHTML = historial.map(t => `
      <tr>
        <td>${t.usuario}</td>
        <td>${formatoFecha(t.inicio)}</td>
        <td>${t.fin ? formatoFecha(t.fin) : "-"}</td>
        <td>${t.cantidad_pedidos}</td>
        <td>$${formatoMoneda(t.total_ventas)}</td>
        <td><span class="tabla-eliminar" style="color:#1f8a5c;" onclick="window.open('/api/turno/${t.id}/reporte', '_blank')">📄 PDF</span></td>
      </tr>
    `).join("") || `<tr><td colspan="6" style="text-align:center;color:#5b6b64;">Sin turnos registrados todavía</td></tr>`;
  } catch (e) {
    setStatus("❌ " + e.message);
  }
}

function formatoFecha(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

/* ============================================================
   SINCRONIZACIÓN
   ============================================================ */
function abrirSincronizacion() {
  document.getElementById("syncResultado").textContent = 'Presiona "Sincronizar ahora" para actualizar los datos.';
  abrirModal("sincronizacionModal");
}

async function ejecutarSincronizacion() {
  const el = document.getElementById("syncResultado");
  el.textContent = "Sincronizando...";
  try {
    const data = await apiFetch(API.sync);
    await cargarProductos();
    el.innerHTML = `
      ✅ Sincronizado a las ${formatoFecha(data.hora)}<br>
      📦 ${data.productos} productos · 👤 ${data.compradores} compradores<br>
      📋 ${data.recetas} recetas · 🧾 ${data.ventas} ventas registradas
    `;
    setStatus("✅ Datos sincronizados");
  } catch (e) {
    el.textContent = "❌ " + e.message;
  }
}