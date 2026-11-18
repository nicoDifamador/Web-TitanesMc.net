// =================================================================
// CARRITO DE COMPRAS FUNCIONAL Y ANIMADO
// =================================================================
let carrito = JSON.parse(localStorage.getItem("titanes_cart")) || [];
let descuentoAplicado = 0; // Porcentaje de descuento global (ej. 0.10 para 10%)

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

function agregarAlCarrito(nombre, precio) {
    if (!nombre || isNaN(precio)) {
        console.error("Error al agregar al producto:", { nombre, precio });
        return;
    }

    const precioNum = parseFloat(precio);
    const itemExistente = carrito.find(item => item.name === nombre);
    
    if (itemExistente) {
        itemExistente.cantidad += 1;
    } else {
        carrito.push({ name: nombre, price: precioNum, cantidad: 1 });
    }
    
    guardarCarrito();
    mostrarToast(`✨ ¡${nombre} agregado al carrito!`);
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
        container.innerHTML = `<p style="color: #94a3b8; font-size: 13px; margin: 20px 0; text-align: center;">Tu carrito está vacío.</p>`;
        if (subtotalText) subtotalText.innerHTML = `<span>Subtotal:</span> <span>$0.00</span>`;
        if (discountText) discountText.style.display = "none";
        if (totalContainer) totalContainer.textContent = "$0.00";
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
                    <small style="color: #a0aec0; font-size: 11px;">$${itemTotal.toFixed(2)}</small>
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

    if (subtotalText) subtotalText.innerHTML = `<span>Subtotal:</span> <span>$${subtotal.toFixed(2)}</span>`;
    
    if (descuentoAplicado > 0) {
        if (discountText) discountText.style.display = "flex";
        if (discountAmountSpan) discountAmountSpan.textContent = `-$${descuentoValor.toFixed(2)}`;
    } else {
        if (discountText) discountText.style.display = "none";
    }

    if (totalContainer) totalContainer.textContent = `$${totalFinal.toFixed(2)}`;
}

// Sistema de cupones
function aplicarCupon() {
    const input = document.getElementById("coupon-input");
    if (!input) return;
    const codigo = input.value.trim().toUpperCase();

    if (codigo === "TITANES10") {
        descuentoAplicado = 0.10;
        mostrarToast("🎉 ¡Cupón aplicado: 10% de descuento!");
        renderizarCarrito();
    } else if (codigo === "TITANES15") {
        descuentoAplicado = 0.15;
        mostrarToast("🎉 ¡Cupón aplicado: 15% de descuento!");
        renderizarCarrito();
    } else if(codigo === "TITANES100") {
        descuentoAplicado = 1.0; // 100% de descuento
        mostrarToast("🎉 ¡Cupón aplicado: 100% de descuento!");
        renderizarCarrito();
    } else {
        alert("❌ Cupón inválido o expirado.");
        descuentoAplicado = 0;
        renderizarCarrito();
    }
}

// =================================================================
// PASARELA DE PAGO Y CHECKOUT (CON PAYPAL INTEGRADO)
// =================================================================
function procederCheckout() {
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

    document.getElementById("checkout-user").textContent = usuarioGuardado;
    document.getElementById("checkout-total-text").textContent = `Total a Pagar: $${totalFinal.toFixed(2)}`;

    document.getElementById("basket-modal").style.display = "none";
    document.getElementById("checkout-modal").style.display = "flex";

    // Cargar botones oficiales de PayPal dinámicamente
    renderizarPayPal(totalFinal);
}

function cerrarCheckout() {
    document.getElementById("checkout-modal").style.display = "none";
}

function renderizarPayPal(totalFinal) {
    const container = document.getElementById("paypal-button-container");
    container.innerHTML = ""; // Limpiar botones anteriores si los hubiera

    if (typeof paypal !== "undefined") {
        paypal.Buttons({
            createOrder: function(data, actions) {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: totalFinal.toFixed(2)
                        }
                    }]
                });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    alert(`✅ ¡Pago exitoso completado por ${details.payer.name.given_name}! Gracias por apoyar a TITANES MC.`);
                    carrito = [];
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
document.addEventListener("DOMContentLoaded", () => {
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