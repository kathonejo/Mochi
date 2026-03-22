const languages = Array.isArray(navigator.languages) && navigator.languages.length
  ? navigator.languages
  : [navigator.language];
const isSpanish = languages.some((lang) => (lang || "").toLowerCase().startsWith("es"));

function t(en, es) {
  return isSpanish ? es : en;
}

document.getElementById("success-title").textContent = t("You're all set!", "Listo! Ya está configurado.");
document.getElementById("success-subtitle").textContent = t(
  "Your first mochi is ready. Open any page to start enjoying your AI pet.",
  "Tu primer mochi está listo. Abrí cualquier página para empezar a disfrutarlo."
);
document.getElementById("cta-factory").textContent = t("Get a Mochi NFT", "Conseguí un Mochi NFT");
document.getElementById("cta-close").textContent = t("Close this tab", "Cerrar esta pestaña");
document.getElementById("success-hint").textContent = t(
  "Tip: You can close this tab and browse anywhere. Your mochis will appear on the pages you open.",
  "Tip: Podés cerrar esta pestaña y navegar normalmente. Tus mochis aparecerán en las páginas que abras."
);

const closeBtn = document.getElementById("cta-close");
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.close();
  });
}
