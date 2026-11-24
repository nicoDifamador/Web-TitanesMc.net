(() => {
    const destino = "tienda.html";

    function entrarTienda() {
        window.location.assign(destino);
    }

    document.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        if (event.target.closest("[data-action=enter-store]")) entrarTienda();
    });

    window.setTimeout(entrarTienda, 2000);
})();
