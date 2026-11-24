// =================================================================
// CARRITO DE COMPRAS FUNCIONAL Y ANIMADO
// =================================================================
const NOMBRE_JUGADOR = /^[A-Za-z0-9_]{3,16}$/;

function leerAlmacenamiento(clave, valorPredeterminado) {
    try {
        const valor = localStorage.getItem(clave);
        return valor === null ? valorPredeterminado : JSON.parse(valor);
    } catch (error) {
        console.warn(`Se descartó el valor inválido de ${clave}`, error);
        try {
            localStorage.removeItem(clave);
        } catch (_storageError) {
            // Some privacy modes disable storage entirely; continue in memory.
        }
        return valorPredeterminado;
    }
}

function normalizarCarrito(valor) {
    if (!Array.isArray(valor)) return [];
    return valor
        .filter(item => item && typeof item.name === "string" && item.name.length <= 120)
        .map(item => ({
            name: item.name,
            cantidad: Number.isInteger(item.cantidad) ? item.cantidad : 1
        }))
        .filter(item => item.cantidad >= 1 && item.cantidad <= 99);
}

function leerUsuarioGuardado() {
    const usuario = leerAlmacenamiento("titanes_user", "");
    return typeof usuario === "string" && NOMBRE_JUGADOR.test(usuario) ? usuario : "";
}

let carrito = normalizarCarrito(leerAlmacenamiento("titanes_cart", []));
let descuentoAplicado = 0; // Porcentaje de descuento global (ej. 0.10 para 10%)
let cuponAplicado = "";
let configuracionTienda;
let modalAnterior = null;

function elementosEnfocables(contenedor) {
    return [...contenedor.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(elemento => !elemento.hidden && elemento.offsetParent !== null);
}

function abrirModal(modal, activador = document.activeElement) {
    if (!modal) return;
    modalAnterior = activador instanceof HTMLElement ? activador : null;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    const primerElemento = elementosEnfocables(modal)[0];
    (primerElemento || modal).focus();
}

function cerrarModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    if (modalAnterior?.isConnected) modalAnterior.focus();
    modalAnterior = null;
}

const configuracionTiendaPromise = fetch("config.json")
    .then(respuesta => {
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar config.json (HTTP ${respuesta.status})`);
        }
        return respuesta.json();
    })
    .then(configuracion => {
        if (!configuracion.products || !configuracion.discounts || !configuracion.design?.colors || !configuracion.site) {
            throw new Error("config.json no contiene productos, descuentos y diseño");
        }
        if (!/^[A-Z]{3}$/.test(configuracion.currency)) {
            throw new Error("La moneda de config.json debe ser un código ISO de tres letras");
        }
        const descuentoGlobal = configuracion.discounts.globalPercent;
        if (!Number.isFinite(descuentoGlobal) || descuentoGlobal < 0 || descuentoGlobal > 100) {
            throw new Error("El descuento global de config.json debe estar entre 0 y 100");
        }
        for (const [nombre, producto] of Object.entries(configuracion.products)) {
            if (!Number.isFinite(producto.price) || producto.price < 0) {
                throw new Error(`Precio inválido en config.json para ${nombre}`);
            }
        }
        for (const [nombre, porcentaje] of Object.entries(configuracion.discounts.products || {})) {
            if (!configuracion.products[nombre] || !Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
                throw new Error(`Descuento por producto inválido en config.json para ${nombre}`);
            }
        }
        for (const [codigo, cupon] of Object.entries(configuracion.discounts.coupons || {})) {
            if (!Number.isFinite(cupon.percent) || cupon.percent < 0 || cupon.percent > 100) {
                throw new Error(`Descuento inválido para el cupón ${codigo}`);
            }
        }
        if (!configuracion.site.name || !configuracion.site.serverAddress || !configuracion.site.logo || !configuracion.design.fontFamily) {
            throw new Error("Faltan datos de marca o tipografía en config.json");
        }
        configuracionTienda = configuracion;
        return configuracion;
    });

configuracionTiendaPromise.catch(error => {
    console.error("Error al cargar la configuración de la tienda:", error);
});

function obtenerPrecioConfigurado(configuracion, nombre) {
    const producto = configuracion.products[nombre];
    if (!producto) {
        throw new Error(`El producto "${nombre}" no existe en config.json`);
    }

    const descuentosProducto = configuracion.discounts.products || {};
    const porcentaje = Object.prototype.hasOwnProperty.call(descuentosProducto, nombre)
        ? descuentosProducto[nombre]
        : configuracion.discounts.globalPercent;
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        throw new Error(`Descuento inválido en config.json para ${nombre}`);
    }

    return Math.round(producto.price * (1 - porcentaje / 100) * 100) / 100;
}

function formatearPrecio(valor, configuracion) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: configuracion.currency || "USD"
    }).format(valor);
}

let paypalSdkPromise;
function cargarSdkPayPal(configuracion) {
    if (window.paypal) return Promise.resolve();
    if (paypalSdkPromise) return paypalSdkPromise;
    if (!configuracion.paypal?.clientId) {
        return Promise.reject(new Error("Falta paypal.clientId en config.json"));
    }

    paypalSdkPromise = new Promise((resolve, reject) => {
        const url = new URL("https://www.paypal.com/sdk/js");
        url.searchParams.set("client-id", configuracion.paypal.clientId);
        url.searchParams.set("currency", configuracion.currency || "USD");

        const script = document.createElement("script");
        script.src = url.toString();
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("No se pudo cargar el SDK de PayPal"));
        document.head.appendChild(script);
    });

    return paypalSdkPromise;
}

function aplicarDisenoConfigurado(configuracion) {
    const root = document.documentElement;
    const propiedades = {
        primary: "--site-primary",
        background: "--site-background",
        surface: "--site-surface",
        text: "--site-text",
        muted: "--site-muted",
        border: "--site-border",
        success: "--site-success"
    };

    for (const [clave, propiedad] of Object.entries(propiedades)) {
        const color = configuracion.design.colors[clave];
        if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
            throw new Error(`Color inválido en config.json: design.colors.${clave}`);
        }
        root.style.setProperty(propiedad, color);
    }
    root.style.setProperty("--site-font-family", configuracion.design.fontFamily);
    document.querySelectorAll(".submit-btn").forEach(boton => {
        boton.style.backgroundColor = configuracion.design.colors.primary;
        boton.style.color = configuracion.design.colors.background;
    });

    document.querySelectorAll("header .logo-area img, img.logo-glow").forEach(imagen => {
        imagen.src = configuracion.site.logo;
        imagen.alt = `${configuracion.site.name} Logo`;
    });
    document.querySelectorAll(".server-title h1").forEach(titulo => {
        titulo.textContent = configuracion.site.name;
    });
    document.querySelectorAll(".server-title span").forEach(subtitulo => {
        subtitulo.textContent = configuracion.site.subtitle || "";
    });
    document.querySelectorAll(".site-footer .footer-col:first-child h4").forEach(titulo => {
        titulo.textContent = `${configuracion.site.name} ${configuracion.site.subtitle || ""}`.trim();
    });
    document.querySelectorAll(".footer-bottom strong").forEach(titulo => {
        titulo.textContent = configuracion.site.name;
    });
    document.querySelectorAll("strong").forEach(elemento => {
        if (elemento.textContent.trim() === "Titanesmc.net") {
            elemento.textContent = configuracion.site.serverAddress;
        }
    });
    document.querySelectorAll("[data-currency-label]").forEach(elemento => {
        elemento.textContent = configuracion.currency;
    });
}

function obtenerPorcentajeCupon(configuracion, codigo) {
    const cupon = configuracion.discounts.coupons?.[codigo];
    return cupon?.enabled ? cupon.percent : null;
}

function actualizarPreciosConfigurados(configuracion) {
    document.querySelectorAll("[data-product-price]").forEach(elemento => {
        const nombre = elemento.dataset.productPrice;
        const precio = obtenerPrecioConfigurado(configuracion, nombre);
        const sufijo = (elemento.dataset.priceSuffix || "").replace("USD", configuracion.currency);
        elemento.textContent = `${elemento.dataset.pricePrefix || ""}${formatearPrecio(precio, configuracion)}${sufijo}`;
    });

    document.querySelectorAll("[data-product-discount]").forEach(elemento => {
        const nombre = elemento.dataset.productDiscount;
        const producto = configuracion.products[nombre];
        if (!producto) {
            throw new Error(`El producto "${nombre}" del descuento no existe en config.json`);
        }
        const descuentosProducto = configuracion.discounts.products || {};
        const porcentaje = Object.prototype.hasOwnProperty.call(descuentosProducto, nombre)
            ? descuentosProducto[nombre]
            : configuracion.discounts.globalPercent;
        elemento.textContent = `-${porcentaje}% DESC`;
        elemento.hidden = porcentaje <= 0;
    });

}

function sincronizarPreciosCarrito(configuracion) {
    carrito = carrito.filter(item => {
        if (!configuracion.products[item.name]) {
            console.error(`El producto guardado "${item.name}" ya no existe en config.json`);
            return false;
        }
        item.price = obtenerPrecioConfigurado(configuracion, item.name);
        return true;
    });
    guardarCarrito();
}

function guardarCarrito() {
    try {
        localStorage.setItem("titanes_cart", JSON.stringify(carrito));
    } catch (error) {
        console.warn("No se pudo persistir el carrito en este navegador", error);
    }
    actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
    const btnBasket = document.getElementById("btn-basket");
    if (btnBasket) {
        const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);
        btnBasket.textContent = `🛒 Carrito (${totalItems})`;
    }
}

function mostrarToast(mensaje) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.classList.add("is-visible");
    setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2500);
}

async function agregarAlCarrito(nombre) {
    let configuracion;
    try {
        configuracion = await configuracionTiendaPromise;
    } catch (error) {
        alert("No se pudo cargar la configuración de precios. Inténtalo más tarde.");
        return;
    }

    let precio;
    try {
        precio = obtenerPrecioConfigurado(configuracion, nombre);
    } catch (error) {
        console.error("No se pudo agregar el producto al carrito:", error);
        alert("Este producto no está disponible para la compra.");
        return;
    }

    const itemExistente = carrito.find(item => item.name === nombre);
    
    if (itemExistente) {
        if (itemExistente.cantidad >= 99) {
            alert("No se pueden agregar más de 99 unidades del mismo producto.");
            return;
        }
        itemExistente.cantidad += 1;
    } else {
        carrito.push({ name: nombre, price: precio, cantidad: 1 });
    }
    
    guardarCarrito();
    mostrarToast(`✨ ¡${nombre} agregado al carrito!`);
}

function obtenerProductoDestacado(elemento) {
    const tarjeta = elemento.closest("[data-product-name]");
    if (!tarjeta) {
        console.error("No se encontró la tarjeta del producto destacado.");
        return null;
    }

    const nombre = tarjeta.dataset.productName;
    if (!nombre) {
        console.error("Falta el nombre del producto destacado:", tarjeta.dataset);
        return null;
    }

    return { nombre };
}

function agregarProductoDestacado(boton) {
    const producto = obtenerProductoDestacado(boton);
    if (producto) {
        agregarAlCarrito(producto.nombre);
    }
}

function eliminarDelCarrito(nombre) {
    carrito = carrito.filter(item => item.name !== nombre);
    guardarCarrito();
    renderizarCarrito();
}

function renderizarCarrito() {
    const container = document.getElementById("cart-items-list");
    const totalContainer = document.getElementById("cart-total-amount");
    const subtotalText = document.getElementById("subtotal-text");
    const discountText = document.getElementById("discount-text");
    const discountAmountSpan = document.getElementById("discount-amount");

    if (!container) return;

    const precio = (valor) => configuracionTienda
        ? formatearPrecio(valor, configuracionTienda)
        : `$${valor.toFixed(2)}`;

    const actualizarLineaResumen = (elemento, etiqueta, valor) => {
        if (!elemento) return;
        const etiquetaElement = document.createElement("span");
        etiquetaElement.textContent = etiqueta;
        const valorElement = document.createElement("span");
        valorElement.textContent = valor;
        elemento.replaceChildren(etiquetaElement, valorElement);
    };

    if (carrito.length === 0) {
        const precioCero = precio(0);
        const empty = document.createElement("p");
        empty.className = "cart-empty";
        empty.textContent = "Tu carrito está vacío.";
        container.replaceChildren(empty);
        actualizarLineaResumen(subtotalText, "Subtotal:", precioCero);
        if (discountText) discountText.hidden = true;
        if (totalContainer) totalContainer.textContent = precioCero;
        return;
    }

    container.replaceChildren();
    let subtotal = 0;

    carrito.forEach(item => {
        const itemTotal = Number(item.price) * item.cantidad;
        subtotal += itemTotal;
        const row = document.createElement("div");
        row.className = "cart-item-row";

        const info = document.createElement("div");
        info.className = "cart-item-info";
        const name = document.createElement("span");
        name.className = "cart-item-name";
        name.textContent = `${item.name} (x${item.cantidad})`;
        const amount = document.createElement("small");
        amount.className = "cart-item-price";
        amount.textContent = precio(itemTotal);
        info.append(name, amount);

        const actions = document.createElement("div");
        actions.className = "cart-item-actions";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn-remove";
        remove.dataset.action = "remove-cart-item";
        remove.dataset.productName = item.name;
        remove.setAttribute("aria-label", `Eliminar ${item.name} del carrito`);
        remove.title = "Eliminar producto";
        remove.textContent = "🗑️";
        actions.append(remove);
        row.append(info, actions);
        container.append(row);
    });

    let descuentoValor = subtotal * descuentoAplicado;
    let totalFinal = subtotal - descuentoValor;

    actualizarLineaResumen(subtotalText, "Subtotal:", precio(subtotal));
    
    if (descuentoAplicado > 0) {
        if (discountText) discountText.hidden = false;
        if (discountAmountSpan) discountAmountSpan.textContent = `-${precio(descuentoValor)}`;
    } else {
        if (discountText) discountText.hidden = true;
    }

    if (totalContainer) totalContainer.textContent = precio(totalFinal);
}

// Sistema de cupones
async function aplicarCupon() {
    const input = document.getElementById("coupon-input");
    if (!input) return;
    const codigo = input.value.trim().toUpperCase();
    let configuracion;
    try {
        configuracion = await configuracionTiendaPromise;
    } catch (error) {
        alert("No se pudo cargar la configuración de descuentos. Inténtalo más tarde.");
        return;
    }

    const porcentaje = obtenerPorcentajeCupon(configuracion, codigo);
    if (porcentaje === null) {
        alert("❌ Cupón inválido o expirado.");
        descuentoAplicado = 0;
        cuponAplicado = "";
        renderizarCarrito();
        return;
    }

    descuentoAplicado = porcentaje / 100;
    cuponAplicado = codigo;
    mostrarToast(`🎉 ¡Cupón aplicado: ${porcentaje}% de descuento!`);
    renderizarCarrito();
}

// =================================================================
// PASARELA DE PAGO Y CHECKOUT (CON PAYPAL INTEGRADO)
// =================================================================
async function procederCheckout() {
    if (carrito.length === 0) {
        alert("Tu carrito está vacío. Agrega ítems antes de proceder.");
        return;
    }

    const usuarioGuardado = leerUsuarioGuardado();
    if (!usuarioGuardado) {
        alert("Debes iniciar sesión con tu nick de Minecraft antes de comprar.");
        manejarSesion();
        return;
    }

    let subtotal = carrito.reduce((acc, item) => acc + (item.price * item.cantidad), 0);
    let totalFinal = subtotal - (subtotal * descuentoAplicado);
    let configuracion;
    try {
        configuracion = await configuracionTiendaPromise;
    } catch (error) {
        alert("No se pudo cargar la configuración de la tienda. Inténtalo más tarde.");
        return;
    }
    try {
        await cargarSdkPayPal(configuracion);
    } catch (error) {
        console.error("No se pudo preparar PayPal:", error);
        alert("No se pudo cargar PayPal. Inténtalo más tarde.");
        return;
    }

    document.getElementById("checkout-user").textContent = usuarioGuardado;
    document.getElementById("checkout-total-text").textContent = `Total a Pagar: ${formatearPrecio(totalFinal, configuracion)}`;

    cerrarModal(document.getElementById("basket-modal"));
    abrirModal(document.getElementById("checkout-modal"));

    // Cargar botones oficiales de PayPal dinámicamente
    renderizarPayPal(usuarioGuardado, configuracion);
}

function cerrarCheckout() {
    cerrarModal(document.getElementById("checkout-modal"));
}

function renderizarPayPal(usuario, configuracion) {
    const container = document.getElementById("paypal-button-container");
    container.replaceChildren(); // Limpiar botones anteriores si los hubiera

    if (typeof paypal !== "undefined") {
        paypal.Buttons({
            createOrder: async function() {
                const endpoint = new URL("/api/paypal/orders", configuracion.apiBaseUrl || window.location.origin);
                const respuesta = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        items: carrito.map(item => ({ name: item.name, quantity: item.cantidad })),
                        coupon: cuponAplicado,
                        player: usuario
                    })
                });
                const resultado = await respuesta.json();
                if (!respuesta.ok || !resultado.id) {
                    throw new Error(resultado.error || "El servidor no pudo crear la orden de PayPal");
                }
                document.getElementById("checkout-total-text").textContent =
                    `Total a Pagar: ${formatearPrecio(Number(resultado.total), configuracion)}`;
                return resultado.id;
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    alert(`✅ ¡Pago exitoso completado por ${details.payer.name.given_name}! Gracias por apoyar a TITANES MC.`);
                    carrito = [];
                    descuentoAplicado = 0;
                    cuponAplicado = "";
                    guardarCarrito();
                    cerrarModal(document.getElementById("checkout-modal"));
                });
            },
            onError: function(err) {
                console.error("Error en la pasarela de PayPal:", err);
                alert("Hubo un error procesando tu pago con PayPal. Inténtalo de nuevo.");
            }
        }).render("#paypal-button-container");
    } else {
        const errorMessage = document.createElement("p");
        errorMessage.className = "paypal-error";
        errorMessage.textContent = "El SDK de PayPal no se pudo cargar. Revisa tu conexión.";
        container.replaceChildren(errorMessage);
    }
}

// =================================================================
// GESTIÓN DE SESIÓN Y EVENTOS DE INTERFAZ
// =================================================================
function manejarSesion() {
    const usuarioGuardado = leerUsuarioGuardado();
    if (usuarioGuardado) {
        if (confirm(`Sesión iniciada como: ${usuarioGuardado}\n¿Deseas cerrar sesión?`)) {
            localStorage.removeItem("titanes_user");
            actualizarBotonSesion();
            alert("Has cerrado sesión.");
        }
    } else {
        abrirModal(document.getElementById("login-modal"));
    }
}

function guardarSesion(event) {
    event.preventDefault();
    const inputNick = document.getElementById("input-nick");
    if (!inputNick) return;
    
    const nick = inputNick.value.trim();
    if (!NOMBRE_JUGADOR.test(nick)) {
        inputNick.setCustomValidity("Usa entre 3 y 16 caracteres: letras, números o guion bajo.");
        inputNick.reportValidity();
        return;
    }

    inputNick.setCustomValidity("");
    try {
        localStorage.setItem("titanes_user", nick);
    } catch (error) {
        console.warn("No se pudo guardar el nickname en este navegador", error);
    }
    cerrarModal(document.getElementById("login-modal"));
    actualizarBotonSesion();
    alert(`¡Bienvenido, ${nick}! Sesión guardada con éxito.`);
}

function actualizarBotonSesion() {
    const btnLogin = document.getElementById("btn-login-user");
    if (!btnLogin) return;
    
    const usuarioGuardado = leerUsuarioGuardado();
    
    if (usuarioGuardado) {
        btnLogin.replaceChildren();
        const avatar = document.createElement("img");
        avatar.className = "session-avatar";
        avatar.src = `https://crafthead.net/avatar/${encodeURIComponent(usuarioGuardado)}/24`;
        avatar.alt = "";
        avatar.referrerPolicy = "no-referrer";
        avatar.addEventListener("error", () => avatar.remove(), { once: true });
        btnLogin.append(avatar, document.createTextNode(usuarioGuardado));
        btnLogin.style.borderColor = "#10b981";
        btnLogin.style.color = "#10b981";
    } else {
        btnLogin.textContent = "Iniciar Sesión";
        btnLogin.style.borderColor = "";
        btnLogin.style.color = "";
    }
}

// =================================================================
// GESTIÓN DE MODALES DE RANGOS / LLAVES / PROTECCIONES
// =================================================================
function abrirModalRango(modalId) {
    const modal = document.getElementById(modalId);
    abrirModal(modal);
}

function cerrarModalRango(modalId) {
    const modal = document.getElementById(modalId);
    cerrarModal(modal);
}

function manejarAccionInterfaz(event) {
    const control = event.target.closest("[data-action]");
    if (!control) return;

    const accion = control.dataset.action;
    if (accion === "session") {
        manejarSesion();
    } else if (accion === "copy-ip") {
        const ip = control.dataset.ip || "Titanesmc.net";
        const copia = navigator.clipboard?.writeText(ip);
        if (copia) {
            copia.then(() => mostrarToast(`IP copiada: ${ip}`))
                .catch(() => mostrarToast(`IP del servidor: ${ip}`));
        } else {
            mostrarToast(`IP del servidor: ${ip}`);
        }
    } else if (accion === "add-featured") {
        agregarProductoDestacado(control);
    } else if (accion === "add-product") {
        const nombre = control.dataset.productName;
        if (nombre) agregarAlCarrito(nombre);
        if (control.dataset.closeModal) cerrarModalRango(control.dataset.closeModal);
    } else if (accion === "open-modal") {
        const modal = document.getElementById(control.dataset.modalId);
        abrirModal(modal, control);
    } else if (accion === "close-modal") {
        cerrarModalRango(control.dataset.modalId);
    } else if (accion === "apply-coupon") {
        aplicarCupon();
    } else if (accion === "checkout") {
        procederCheckout();
    } else if (accion === "close-checkout") {
        cerrarCheckout();
    } else if (accion === "remove-cart-item") {
        eliminarDelCarrito(control.dataset.productName || "");
    }
}

document.addEventListener("click", manejarAccionInterfaz);
document.addEventListener("keydown", (event) => {
    const modal = event.target.closest?.('.modal-overlay:not([hidden]), .rank-modal-overlay:not([hidden])');
    if (!modal) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        cerrarModal(modal);
        return;
    }
    if (event.key !== 'Tab') return;
    const enfocables = elementosEnfocables(modal);
    if (!enfocables.length) {
        event.preventDefault();
        modal.focus();
        return;
    }
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primero.focus();
    }
});
document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-action=save-session]")) guardarSesion(event);
});

// =================================================================
// INICIALIZACIÓN GENERAL AL CARGAR EL DOM
// =================================================================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const configuracion = await configuracionTiendaPromise;
        aplicarDisenoConfigurado(configuracion);
        actualizarPreciosConfigurados(configuracion);
        sincronizarPreciosCarrito(configuracion);
    } catch (error) {
        console.error("No se pudo aplicar config.json:", error);
        mostrarToast("No se pudo cargar la configuración de la tienda.");
    }

    actualizarBotonSesion();
    actualizarContadorCarrito();

    // Forzar que TODOS los modales (rangos, llaves, login, carrito, checkout) comiencen ocultos
    const modalesOverlay = document.querySelectorAll('.modal-overlay, .rank-modal-overlay');
    modalesOverlay.forEach(m => {
        m.hidden = true;
        m.setAttribute('aria-hidden', 'true');
        m.tabIndex = -1;
        m.style.display = 'none';
    });

    const btnBasket = document.getElementById("btn-basket");
    const basketModal = document.getElementById("basket-modal");
    const closeBasket = document.getElementById("close-basket");
    const loginModal = document.getElementById("login-modal");
    const closeLogin = document.getElementById("close-login");
    const checkoutModal = document.getElementById("checkout-modal");

    if (btnBasket && basketModal) {
        btnBasket.addEventListener("click", () => {
            renderizarCarrito();
            abrirModal(basketModal, btnBasket);
        });
    }

    if (closeBasket && basketModal) {
        closeBasket.addEventListener("click", () => cerrarModal(basketModal));
    }

    if (closeLogin && loginModal) {
        closeLogin.addEventListener("click", () => cerrarModal(loginModal));
    }

    // Cerrar modales al hacer clic fuera del contenido principal
    window.addEventListener("click", (e) => {
        if (basketModal && e.target === basketModal) cerrarModal(basketModal);
        if (loginModal && e.target === loginModal) cerrarModal(loginModal);
        if (checkoutModal && e.target === checkoutModal) cerrarModal(checkoutModal);
        
        // También cerrar modales de rangos/llaves al hacer clic en el overlay
        modalesOverlay.forEach(modal => {
            if (e.target === modal) {
                cerrarModal(modal);
            }
        });
    });
});
