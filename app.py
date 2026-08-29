"""
INTELLIGENT NUTRITION - Sistema de Ventas Web
Backend Flask con persistencia en JSON (data.json).
"""
from flask import Flask, render_template, request, jsonify, session, send_file
from flask_cors import CORS
from datetime import datetime
import json
import os
import uuid
import io

from reportlab.lib.pagesizes import mm
from reportlab.lib.units import mm as MM
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")

app = Flask(__name__)
app.secret_key = "cambia-esta-clave-por-una-segura-en-produccion"
CORS(app, supports_credentials=True)


# ------------------------------------------------------------------
# Persistencia
# ------------------------------------------------------------------
def datos_por_defecto():
    return {
        "usuarios": [
            {"usuario": "admin", "password": "admin123", "rol": "Administrador", "nombre": "Administrador"},
            {"usuario": "vendedor", "password": "ventas123", "rol": "Vendedor", "nombre": "Vendedor"},
        ],
        "productos": [
            {"codigo": "SM001", "nombre": "Smoothie Fresa", "categoria": "Smothies", "costo": 4000, "venta": 9000, "stock": 20, "descuento": 0},
            {"codigo": "SM002", "nombre": "Smoothie Mango", "categoria": "Smothies", "costo": 4200, "venta": 9500, "stock": 18, "descuento": 0},
            {"codigo": "PR001", "nombre": "Proteína Whey 1kg", "categoria": "Proteína", "costo": 45000, "venta": 89000, "stock": 10, "descuento": 5},
            {"codigo": "PR002", "nombre": "Proteína Vegana 1kg", "categoria": "Proteína", "costo": 52000, "venta": 99000, "stock": 6, "descuento": 0},
            {"codigo": "CR001", "nombre": "Creatina Monohidratada 300g", "categoria": "Creatina", "costo": 22000, "venta": 45000, "stock": 12, "descuento": 0},
            {"codigo": "PE001", "nombre": "Pre-entreno Explosivo", "categoria": "Pre-entrenos", "costo": 28000, "venta": 55000, "stock": 8, "descuento": 10},
            {"codigo": "VT001", "nombre": "Multivitamínico", "categoria": "Vitaminas", "costo": 15000, "venta": 32000, "stock": 15, "descuento": 0},
            {"codigo": "ES001", "nombre": "Combo Batido + Proteína", "categoria": "Especiales", "costo": 12000, "venta": 25000, "stock": 5, "descuento": 0},
            {"codigo": "SN001", "nombre": "Barra Proteica", "categoria": "Snacks", "costo": 3000, "venta": 7000, "stock": 30, "descuento": 0},
        ],
        "compradores": [],
        "recetas": [],
        "turno_actual": None,
        "historial_turnos": [],
        "ventas": [],
    }


def cargar_datos():
    if not os.path.exists(DATA_FILE):
        datos = datos_por_defecto()
        guardar_datos(datos)
        return datos
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def guardar_datos(datos):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------
# Helpers de sesión
# ------------------------------------------------------------------
def usuario_actual():
    if "usuario" not in session:
        return None
    datos = cargar_datos()
    for u in datos["usuarios"]:
        if u["usuario"] == session["usuario"]:
            return u
    return None


def requiere_login():
    return usuario_actual() is not None


def requiere_admin():
    u = usuario_actual()
    return u is not None and u["rol"] == "Administrador"


# ------------------------------------------------------------------
# Página principal
# ------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ------------------------------------------------------------------
# Autenticación
# ------------------------------------------------------------------
@app.route("/api/login", methods=["POST"])
def login():
    body = request.get_json(force=True) or {}
    usuario = (body.get("usuario") or "").strip()
    password = body.get("password") or ""

    datos = cargar_datos()
    for u in datos["usuarios"]:
        if u["usuario"] == usuario and u["password"] == password:
            session["usuario"] = u["usuario"]
            return jsonify({"ok": True, "usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"]})

    return jsonify({"ok": False, "error": "Usuario o contraseña incorrectos"}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/session", methods=["GET"])
def session_info():
    u = usuario_actual()
    if not u:
        return jsonify({"ok": False}), 401
    datos = cargar_datos()
    return jsonify({
        "ok": True,
        "usuario": u["usuario"],
        "nombre": u["nombre"],
        "rol": u["rol"],
        "turno_actual": datos.get("turno_actual"),
    })


# ------------------------------------------------------------------
# Productos
# ------------------------------------------------------------------
@app.route("/api/productos", methods=["GET"])
def listar_productos():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    return jsonify(datos["productos"])


@app.route("/api/productos", methods=["POST"])
def guardar_producto():
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403

    body = request.get_json(force=True) or {}
    codigo = (body.get("codigo") or "").strip()
    if not codigo:
        return jsonify({"error": "El código es obligatorio"}), 400

    try:
        costo = float(body.get("costo", 0) or 0)
        venta = float(body.get("venta", 0) or 0)
        stock = int(body.get("stock", 0) or 0)
        descuento = float(body.get("descuento", 0) or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Costo, venta, stock y descuento deben ser numéricos"}), 400

    producto = {
        "codigo": codigo,
        "nombre": (body.get("nombre") or "").strip(),
        "categoria": body.get("categoria") or "Smothies",
        "costo": costo,
        "venta": venta,
        "stock": stock,
        "descuento": descuento,
    }

    datos = cargar_datos()
    existentes = [p for p in datos["productos"] if p["codigo"] == codigo]
    if existentes:
        idx = datos["productos"].index(existentes[0])
        datos["productos"][idx] = producto
    else:
        datos["productos"].append(producto)
    guardar_datos(datos)
    return jsonify({"ok": True, "producto": producto})


@app.route("/api/productos/<codigo>", methods=["DELETE"])
def eliminar_producto(codigo):
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403
    datos = cargar_datos()
    antes = len(datos["productos"])
    datos["productos"] = [p for p in datos["productos"] if p["codigo"] != codigo]
    if len(datos["productos"]) == antes:
        return jsonify({"error": "Producto no encontrado"}), 404
    guardar_datos(datos)
    return jsonify({"ok": True})


# ------------------------------------------------------------------
# Usuarios (solo admin)
# ------------------------------------------------------------------
@app.route("/api/usuarios", methods=["GET"])
def listar_usuarios():
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403
    datos = cargar_datos()
    sin_password = [{"usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"]} for u in datos["usuarios"]]
    return jsonify(sin_password)


@app.route("/api/usuarios", methods=["POST"])
def guardar_usuario():
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403

    body = request.get_json(force=True) or {}
    usuario = (body.get("usuario") or "").strip()
    if not usuario:
        return jsonify({"error": "El usuario es obligatorio"}), 400

    datos = cargar_datos()
    existente = next((u for u in datos["usuarios"] if u["usuario"] == usuario), None)

    if existente:
        existente["nombre"] = body.get("nombre") or existente["nombre"]
        existente["rol"] = body.get("rol") or existente["rol"]
        if body.get("password"):
            existente["password"] = body["password"]
    else:
        if not body.get("password"):
            return jsonify({"error": "La contraseña es obligatoria para un usuario nuevo"}), 400
        datos["usuarios"].append({
            "usuario": usuario,
            "password": body["password"],
            "rol": body.get("rol") or "Vendedor",
            "nombre": body.get("nombre") or usuario,
        })

    guardar_datos(datos)
    return jsonify({"ok": True})


@app.route("/api/usuarios/<usuario>", methods=["DELETE"])
def eliminar_usuario(usuario):
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403
    if usuario == session.get("usuario"):
        return jsonify({"error": "No puedes eliminar tu propio usuario"}), 400

    datos = cargar_datos()
    antes = len(datos["usuarios"])
    datos["usuarios"] = [u for u in datos["usuarios"] if u["usuario"] != usuario]
    if len(datos["usuarios"]) == antes:
        return jsonify({"error": "Usuario no encontrado"}), 404
    guardar_datos(datos)
    return jsonify({"ok": True})


# ------------------------------------------------------------------
# Compradores
# ------------------------------------------------------------------
@app.route("/api/compradores", methods=["GET"])
def listar_compradores():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    q = (request.args.get("q") or "").strip().lower()
    compradores = datos["compradores"]
    if q:
        compradores = [
            c for c in compradores
            if q in c["nombre"].lower() or q in c.get("telefono", "")
        ]
    return jsonify(compradores)


@app.route("/api/compradores", methods=["POST"])
def guardar_comprador():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401

    body = request.get_json(force=True) or {}
    nombre = (body.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio"}), 400
    telefono = (body.get("telefono") or "").strip()

    datos = cargar_datos()
    existente = next(
        (c for c in datos["compradores"] if telefono and c.get("telefono") == telefono),
        None,
    )
    if existente:
        existente["nombre"] = nombre
        comprador = existente
    else:
        comprador = {
            "id": str(uuid.uuid4())[:8],
            "nombre": nombre,
            "telefono": telefono,
            "compras": 0,
            "total_gastado": 0,
        }
        datos["compradores"].append(comprador)

    guardar_datos(datos)
    return jsonify({"ok": True, "comprador": comprador})


# ------------------------------------------------------------------
# Recetas
# ------------------------------------------------------------------
@app.route("/api/recetas", methods=["GET"])
def listar_recetas():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    return jsonify(datos["recetas"])


@app.route("/api/recetas", methods=["POST"])
def guardar_receta():
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403

    body = request.get_json(force=True) or {}
    nombre = (body.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "El nombre de la receta es obligatorio"}), 400

    datos = cargar_datos()
    receta = {
        "id": str(uuid.uuid4())[:8],
        "nombre": nombre,
        "ingredientes": body.get("ingredientes") or "",
    }
    datos["recetas"].append(receta)
    guardar_datos(datos)
    return jsonify({"ok": True, "receta": receta})


@app.route("/api/recetas/<receta_id>", methods=["DELETE"])
def eliminar_receta(receta_id):
    if not requiere_admin():
        return jsonify({"error": "Requiere permisos de administrador"}), 403
    datos = cargar_datos()
    antes = len(datos["recetas"])
    datos["recetas"] = [r for r in datos["recetas"] if r["id"] != receta_id]
    if len(datos["recetas"]) == antes:
        return jsonify({"error": "Receta no encontrada"}), 404
    guardar_datos(datos)
    return jsonify({"ok": True})


# ------------------------------------------------------------------
# Turnos
# ------------------------------------------------------------------
@app.route("/api/turno/iniciar", methods=["POST"])
def iniciar_turno():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    if datos.get("turno_actual"):
        return jsonify({"error": "Ya hay un turno activo"}), 400

    turno = {
        "id": str(uuid.uuid4())[:8],
        "usuario": session["usuario"],
        "inicio": datetime.now().isoformat(timespec="seconds"),
        "fin": None,
        "total_ventas": 0,
        "cantidad_pedidos": 0,
        "ventas": [],
    }
    datos["turno_actual"] = turno
    guardar_datos(datos)
    return jsonify({"ok": True, "turno": turno})


@app.route("/api/turno/cerrar", methods=["POST"])
def cerrar_turno():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    turno = datos.get("turno_actual")
    if not turno:
        return jsonify({"error": "No hay un turno activo"}), 400

    turno["fin"] = datetime.now().isoformat(timespec="seconds")
    datos["historial_turnos"].append(turno)
    datos["turno_actual"] = None
    guardar_datos(datos)
    return jsonify({"ok": True, "turno": turno})


@app.route("/api/turno/actual", methods=["GET"])
def turno_actual_endpoint():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    return jsonify(datos.get("turno_actual"))


@app.route("/api/turno/historial", methods=["GET"])
def historial_turnos():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    return jsonify(list(reversed(datos["historial_turnos"])))


# ------------------------------------------------------------------
# Pedidos / Ventas
# ------------------------------------------------------------------
@app.route("/api/pedidos", methods=["POST"])
def crear_pedido():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401

    datos = cargar_datos()
    if not datos.get("turno_actual"):
        return jsonify({"error": "Debes iniciar un turno antes de registrar pedidos"}), 400

    body = request.get_json(force=True) or {}
    items = body.get("items") or []
    if not items:
        return jsonify({"error": "El carrito está vacío"}), 400

    # Validar stock y calcular subtotal desde el servidor (no confiar en el cliente)
    productos_por_codigo = {p["codigo"]: p for p in datos["productos"]}
    subtotal = 0
    detalle = []
    for item in items:
        codigo = item.get("codigo")
        cantidad = int(item.get("cantidad", 0) or 0)
        producto = productos_por_codigo.get(codigo)
        if not producto:
            return jsonify({"error": f"Producto {codigo} no existe"}), 400
        if cantidad <= 0:
            return jsonify({"error": f"Cantidad inválida para {codigo}"}), 400
        if producto["stock"] < cantidad:
            return jsonify({"error": f"Stock insuficiente para {producto['nombre']}"}), 400

        precio_unit = producto["venta"] * (1 - (producto.get("descuento", 0) / 100))
        detalle.append({
            "codigo": codigo,
            "nombre": producto["nombre"],
            "cantidad": cantidad,
            "precio_unitario": round(precio_unit, 2),
            "subtotal": round(precio_unit * cantidad, 2),
        })
        subtotal += precio_unit * cantidad

    descuento_adicional = body.get("descuento_adicional") or {"tipo": "porcentaje", "valor": 0}
    tipo = descuento_adicional.get("tipo", "porcentaje")
    valor = float(descuento_adicional.get("valor", 0) or 0)
    if tipo == "porcentaje":
        total = subtotal * (1 - valor / 100)
    else:
        total = max(subtotal - valor, 0)

    # Descontar stock
    for item in detalle:
        productos_por_codigo[item["codigo"]]["stock"] -= item["cantidad"]

    venta = {
        "id": str(uuid.uuid4())[:8],
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "vendedor": session["usuario"],
        "items": detalle,
        "subtotal": round(subtotal, 2),
        "descuento_adicional": {"tipo": tipo, "valor": valor},
        "total": round(total, 2),
        "comprador": body.get("comprador"),
        "metodo_pago": body.get("metodo_pago", "Efectivo"),
        "observaciones": body.get("observaciones", ""),
    }
    datos["ventas"].append(venta)

    # Actualizar turno activo
    datos["turno_actual"]["total_ventas"] += venta["total"]
    datos["turno_actual"]["cantidad_pedidos"] += 1
    datos["turno_actual"].setdefault("ventas", []).append(venta["id"])

    # Actualizar comprador si existe
    if venta["comprador"] and venta["comprador"].get("telefono"):
        comp = next(
            (c for c in datos["compradores"] if c.get("telefono") == venta["comprador"]["telefono"]),
            None,
        )
        if comp:
            comp["compras"] += 1
            comp["total_gastado"] += venta["total"]

    guardar_datos(datos)
    return jsonify({"ok": True, "venta": venta})


# ------------------------------------------------------------------
# Recibo en PDF
# ------------------------------------------------------------------
def generar_recibo_pdf(venta):
    """Genera un recibo estilo ticket (80mm) para una venta y lo devuelve como BytesIO."""
    ancho = 80 * MM
    # Alto dinámico según cantidad de líneas de producto
    alto_base = 95 * MM
    alto_por_item = 6 * MM
    alto = alto_base + alto_por_item * max(len(venta["items"]), 1)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(ancho, alto))

    margen = 5 * MM
    y = alto - 10 * MM
    centro_x = ancho / 2

    def linea(texto, tam=8, negrita=False, centrado=False, dy=4.2 * MM):
        nonlocal y
        c.setFont("Helvetica-Bold" if negrita else "Helvetica", tam)
        if centrado:
            c.drawCentredString(centro_x, y, texto)
        else:
            c.drawString(margen, y, texto)
        y -= dy

    def separador():
        nonlocal y
        c.setDash(1, 1)
        c.line(margen, y, ancho - margen, y)
        c.setDash()
        y -= 4 * MM

    # Encabezado
    linea("INTELLIGENT NUTRITION", 11, negrita=True, centrado=True, dy=5 * MM)
    linea("Batidos & Proteína", 8, centrado=True)
    linea("Sistema de Ventas", 7, centrado=True)
    separador()

    fecha = datetime.fromisoformat(venta["fecha"]).strftime("%d/%m/%Y %H:%M")
    linea(f"Recibo #: {venta['id']}", 8)
    linea(f"Fecha: {fecha}", 8)
    linea(f"Vendedor: {venta['vendedor']}", 8)
    if venta.get("comprador") and venta["comprador"].get("nombre"):
        linea(f"Cliente: {venta['comprador']['nombre']}", 8)
        if venta["comprador"].get("telefono"):
            linea(f"Tel: {venta['comprador']['telefono']}", 8)
    separador()

    # Items
    linea("CANT  PRODUCTO", 7.5, negrita=True)
    for item in venta["items"]:
        nombre = item["nombre"]
        if len(nombre) > 24:
            nombre = nombre[:23] + "…"
        linea(f"{item['cantidad']:>2} x  {nombre}", 8)
        linea(f"      ${formato_moneda(item['precio_unitario'])} c/u = ${formato_moneda(item['subtotal'])}", 7.5, dy=4.8 * MM)

    separador()
    linea(f"Subtotal: ${formato_moneda(venta['subtotal'])}", 8.5)

    desc = venta.get("descuento_adicional") or {}
    if desc.get("valor"):
        if desc.get("tipo") == "porcentaje":
            linea(f"Descuento: {desc['valor']}%", 8.5)
        else:
            linea(f"Descuento: ${formato_moneda(desc['valor'])}", 8.5)

    linea(f"TOTAL: ${formato_moneda(venta['total'])}", 12, negrita=True, dy=6 * MM)
    linea(f"Método de pago: {venta.get('metodo_pago', 'Efectivo')}", 8)

    if venta.get("observaciones"):
        separador()
        linea("Observaciones:", 7.5, negrita=True)
        linea(venta["observaciones"][:40], 7.5)

    separador()
    linea("¡Gracias por tu compra!", 8.5, centrado=True)
    linea("INTELLIGENT NUTRITION", 7.5, centrado=True)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


def formato_moneda(valor):
    try:
        return f"{round(float(valor)):,}".replace(",", ".")
    except (TypeError, ValueError):
        return str(valor)


@app.route("/api/pedidos/<venta_id>/recibo", methods=["GET"])
def recibo_pdf(venta_id):
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401

    datos = cargar_datos()
    venta = next((v for v in datos["ventas"] if v["id"] == venta_id), None)
    if not venta:
        return jsonify({"error": "Recibo no encontrado"}), 404

    buffer = generar_recibo_pdf(venta)
    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=f"recibo_{venta_id}.pdf",
    )


# ------------------------------------------------------------------
# Reporte de cierre de turno en PDF
# ------------------------------------------------------------------
def generar_reporte_turno_pdf(turno, ventas_turno):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        topMargin=18 * MM, bottomMargin=18 * MM,
        leftMargin=18 * MM, rightMargin=18 * MM,
    )
    styles = getSampleStyleSheet()
    titulo_style = ParagraphStyle("Titulo", parent=styles["Title"], fontSize=18, spaceAfter=2)
    subtitulo_style = ParagraphStyle("Subtitulo", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#5b6b64"))
    seccion_style = ParagraphStyle("Seccion", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#146b45"))
    normal = styles["Normal"]

    story = []
    story.append(Paragraph("INTELLIGENT NUTRITION", titulo_style))
    story.append(Paragraph("Reporte de cierre de turno", subtitulo_style))
    story.append(Spacer(1, 10 * MM))

    inicio = datetime.fromisoformat(turno["inicio"]).strftime("%d/%m/%Y %H:%M")
    fin = datetime.fromisoformat(turno["fin"]).strftime("%d/%m/%Y %H:%M") if turno.get("fin") else "-"

    info_data = [
        ["Vendedor:", turno["usuario"]],
        ["Inicio de turno:", inicio],
        ["Fin de turno:", fin],
        ["Pedidos realizados:", str(turno["cantidad_pedidos"])],
    ]
    info_table = Table(info_data, colWidths=[45 * MM, 100 * MM])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#5b6b64")),
    ]))
    story.append(info_table)

    story.append(Paragraph("Detalle de ventas", seccion_style))

    if not ventas_turno:
        story.append(Paragraph("No se registraron ventas durante este turno.", normal))
    else:
        encabezado = ["Hora", "Recibo", "Cliente", "Items", "Pago", "Total"]
        filas = [encabezado]
        total_efectivo = 0
        total_transferencia = 0

        for v in ventas_turno:
            hora = datetime.fromisoformat(v["fecha"]).strftime("%H:%M")
            cliente = (v.get("comprador") or {}).get("nombre") or "-"
            cant_items = sum(i["cantidad"] for i in v["items"])
            pago = v.get("metodo_pago", "Efectivo")
            if pago == "Efectivo":
                total_efectivo += v["total"]
            else:
                total_transferencia += v["total"]
            filas.append([
                hora,
                v["id"],
                cliente[:22],
                str(cant_items),
                pago,
                f"${formato_moneda(v['total'])}",
            ])

        tabla = Table(filas, colWidths=[18 * MM, 22 * MM, 45 * MM, 15 * MM, 30 * MM, 25 * MM], repeatRows=1)
        tabla.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#146b45")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (3, 0), (3, -1), "CENTER"),
            ("ALIGN", (5, 0), (5, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dfe4e2")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6f5")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(tabla)
        story.append(Spacer(1, 8 * MM))

        resumen_style = ParagraphStyle("Resumen", parent=normal, fontSize=10, alignment=TA_RIGHT)
        total_style = ParagraphStyle("Total", parent=normal, fontSize=14, alignment=TA_RIGHT, textColor=colors.HexColor("#146b45"), fontName="Helvetica-Bold")

        story.append(Paragraph(f"Ventas en efectivo: ${formato_moneda(total_efectivo)}", resumen_style))
        story.append(Paragraph(f"Ventas por transferencia: ${formato_moneda(total_transferencia)}", resumen_style))
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"TOTAL DEL TURNO: ${formato_moneda(turno['total_ventas'])}", total_style))

    doc.build(story)
    buffer.seek(0)
    return buffer


@app.route("/api/turno/<turno_id>/reporte", methods=["GET"])
def reporte_turno(turno_id):
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401

    datos = cargar_datos()
    turno = None
    if datos.get("turno_actual") and datos["turno_actual"]["id"] == turno_id:
        turno = datos["turno_actual"]
    else:
        turno = next((t for t in datos["historial_turnos"] if t["id"] == turno_id), None)

    if not turno:
        return jsonify({"error": "Turno no encontrado"}), 404

    ids_ventas = set(turno.get("ventas", []))
    ventas_turno = [v for v in datos["ventas"] if v["id"] in ids_ventas]
    ventas_turno.sort(key=lambda v: v["fecha"])

    buffer = generar_reporte_turno_pdf(turno, ventas_turno)
    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=f"reporte_turno_{turno_id}.pdf",
    )


# ------------------------------------------------------------------
# Sincronización (recarga todos los datos de golpe)
# ------------------------------------------------------------------
@app.route("/api/sync", methods=["GET"])
def sincronizar():
    if not requiere_login():
        return jsonify({"error": "No autenticado"}), 401
    datos = cargar_datos()
    return jsonify({
        "ok": True,
        "productos": len(datos["productos"]),
        "compradores": len(datos["compradores"]),
        "recetas": len(datos["recetas"]),
        "ventas": len(datos["ventas"]),
        "hora": datetime.now().isoformat(timespec="seconds"),
    })


if __name__ == "__main__":
    print("=" * 60)
    print("      🏪 INTELLIGENT NUTRITION - Sistema de Ventas Web       ")
    print("=" * 60)
    print("🌐 Servidor iniciado en: http://localhost:5000")
    print("👤 Usuarios por defecto:")
    print("   • admin / admin123 (Administrador)")
    print("   • vendedor / ventas123 (Vendedor)")
    print("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=5000)