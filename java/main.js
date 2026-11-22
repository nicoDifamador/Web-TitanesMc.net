// =================================================================
// CARRITO DE COMPRAS FUNCIONAL Y ANIMADO
// =================================================================
let carrito = JSON.parse(localStorage.getItem("titanes_cart")) || [];
let descuentoAplicado = 0; // Porcentaje de descuento global (ej. 0.10 para 10%)
let cuponAplicado = "";
let configuracionTienda;

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
    document.querySelectorAll(".submit-btn, button[onclick*=\"agregarAlCarrito\"]").forEach(boton => {
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

// Limpieza preventiva si hubiera datos viejos con 'undefined' o NaN
if (carrito.some(item => !item.name || isNaN(item.price))) {
    carrito = [];
    localStorage.removeItem("titanes_cart");
}

function guardarCarrito() {
    localStorage.setItem("titanes_cart", JSON.stringify(carrito));
    actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
    const btnBasket = document.getElementById("btn-basket");
    if (btnBasket) {
        const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);
        btnBasket.innerHTML = `🛒 Carrito (${totalItems})`;
    }
}

function mostrarToast(mensaje) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        // Estilos rápidos para el toast si no están en el CSS
        toast.style.cssText = "position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); background: #181f33; color: #f6e05e; border: 1px solid #d69e2e; padding: 12px 24px; border-radius: 8px; font-weight: bold; z-index: 10000; transition: transform 0.3s ease; box-shadow: 0 5px 15px rgba(0,0,0,0.5);";
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(() => {
        toast.style.transform = "translateX(-50%) translateY(100px)";
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

    if (carrito.length === 0) {
        const precioCero = configuracionTienda ? formatearPrecio(0, configuracionTienda) : "$0.00";
        container.innerHTML = `<p style="color: #94a3b8; font-size: 13px; margin: 20px 0; text-align: center;">Tu carrito está vacío.</p>`;
        if (subtotalText) subtotalText.innerHTML = `<span>Subtotal:</span> <span>${precioCero}</span>`;
        if (discountText) discountText.style.display = "none";
        if (totalContainer) totalContainer.textContent = precioCero;
        return;
    }

    let html = '';
    let subtotal = 0;

    carrito.forEach(item => {
        let itemTotal = item.price * item.cantidad;
        subtotal += itemTotal;
        let nombreEscapado = item.name.replace(/'/g, "\\'");
        html += `
            <div class="cart-item-row" style="display: flex; justify-content: space-between; align-items: center; background: #1a202c; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px;">
                <div class="cart-item-info" style="display: flex; flex-direction: column;">
                    <span style="color: #fff; font-size: 13px; font-weight: bold;">${item.name} (x${item.cantidad})</span>
                    <small style="color: #a0aec0; font-size: 11px;">${configuracionTienda ? formatearPrecio(itemTotal, configuracionTienda) : `$${itemTotal.toFixed(2)}`}</small>
                </div>
                <div class="cart-item-actions">
                    <button class="btn-remove" onclick="eliminarDelCarrito('${nombreEscapado}')" style="background: transparent; border: none; cursor: pointer; font-size: 14px;" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    let descuentoValor = subtotal * descuentoAplicado;
    let totalFinal = subtotal - descuentoValor;

    if (subtotalText) subtotalText.innerHTML = `<span>Subtotal:</span> <span>${configuracionTienda ? formatearPrecio(subtotal, configuracionTienda) : `$${subtotal.toFixed(2)}`}</span>`;
    
    if (descuentoAplicado > 0) {
        if (discountText) discountText.style.display = "flex";
        if (discountAmountSpan) discountAmountSpan.textContent = `-${configuracionTienda ? formatearPrecio(descuentoValor, configuracionTienda) : `$${descuentoValor.toFixed(2)}`}`;
    } else {
        if (discountText) discountText.style.display = "none";
    }

    if (totalContainer) totalContainer.textContent = configuracionTienda ? formatearPrecio(totalFinal, configuracionTienda) : `$${totalFinal.toFixed(2)}`;
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

    const usuarioGuardado = localStorage.getItem("titanes_user");
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

    document.getElementById("basket-modal").style.display = "none";
    document.getElementById("checkout-modal").style.display = "flex";

    // Cargar botones oficiales de PayPal dinámicamente
    renderizarPayPal(usuarioGuardado, configuracion);
}

function cerrarCheckout() {
    document.getElementById("checkout-modal").style.display = "none";
}

function renderizarPayPal(usuario, configuracion) {
    const container = document.getElementById("paypal-button-container");
    container.innerHTML = ""; // Limpiar botones anteriores si los hubiera

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
                    document.getElementById("checkout-modal").style.display = "none";
                });
            },
            onError: function(err) {
                console.error("Error en la pasarela de PayPal:", err);
                alert("Hubo un error procesando tu pago con PayPal. Inténtalo de nuevo.");
            }
        }).render("#paypal-button-container");
    } else {
        container.innerHTML = `<p style="color: #e53e3e; font-size: 12px; text-align: center;">El SDK de PayPal no se pudo cargar. Revisa tu conexión.</p>`;
    }
}

// =================================================================
// GESTIÓN DE SESIÓN Y EVENTOS DE INTERFAZ
// =================================================================
function manejarSesion() {
    const usuarioGuardado = localStorage.getItem("titanes_user");
    if (usuarioGuardado) {
        if (confirm(`Sesión iniciada como: ${usuarioGuardado}\n¿Deseas cerrar sesión?`)) {
            localStorage.removeItem("titanes_user");
            actualizarBotonSesion();
            alert("Has cerrado sesión.");
        }
    } else {
        const modal = document.getElementById("login-modal");
        if (modal) modal.style.display = "flex";
    }
}

function guardarSesion(event) {
    event.preventDefault();
    const inputNick = document.getElementById("input-nick");
    if (!inputNick) return;
    
    const nick = inputNick.value.trim();
    if (nick) {
        localStorage.setItem("titanes_user", nick);
        const modal = document.getElementById("login-modal");
        if (modal) modal.style.display = "none";
        actualizarBotonSesion();
        alert(`¡Bienvenido, ${nick}! Sesión guardada con éxito.`);
    }
}

function actualizarBotonSesion() {
    const btnLogin = document.getElementById("btn-login-user");
    if (!btnLogin) return;
    
    const usuarioGuardado = localStorage.getItem("titanes_user");
    
    if (usuarioGuardado) {
        btnLogin.innerHTML = `
            <img src="https://crafthead.net/avatar/${usuarioGuardado}/24" 
                 alt="Skin" 
                 style="width: 20px; height: 20px; vertical-align: middle; border-radius: 3px; margin-right: 6px;"
                 onerror="this.src='https://crafthead.net/avatar/MHF_Steve/24'">
            ${usuarioGuardado}
        `;
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
    if (modal) {
        modal.style.display = 'flex';
    }
}

function cerrarModalRango(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

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
            basketModal.style.display = "flex";
        });
    }

    if (closeBasket && basketModal) {
        closeBasket.addEventListener("click", () => {
            basketModal.style.display = "none";
        });
    }

    if (closeLogin && loginModal) {
        closeLogin.addEventListener("click", () => {
            loginModal.style.display = "none";
        });
    }

    // Cerrar modales al hacer clic fuera del contenido principal
    window.addEventListener("click", (e) => {
        if (basketModal && e.target === basketModal) basketModal.style.display = "none";
        if (loginModal && e.target === loginModal) loginModal.style.display = "none";
        if (checkoutModal && e.target === checkoutModal) checkoutModal.style.display = "none";
        
        // También cerrar modales de rangos/llaves al hacer clic en el overlay
        modalesOverlay.forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
});
