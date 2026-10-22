// The user's chosen look (Default / Light / Dark). The choice is kept in this
// browser's localStorage and applied as <html data-theme="...">; the styles
// live in app.css (Default) and themes.css (Light, Dark).

export const THEME_STORAGE_KEY = "marketing-helper-theme";

export const THEME_OPTIONS = [
  { value: "", label: "Default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

// Goes in every page <head>, after the stylesheets: it runs before the body is
// drawn, so a page never flashes the wrong look. It defines setAppTheme() for
// the picker, and follows a change made in another tab. Every change fires a
// "themechange" event on document (the waitlist charts redraw on it).
export const THEME_HEAD_SCRIPT = `<script>
      (function() {
        var KEY = "${THEME_STORAGE_KEY}";
        function apply(theme) {
          if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
          else document.documentElement.removeAttribute("data-theme");
        }
        function changed() {
          document.dispatchEvent(new Event("themechange"));
        }
        try { apply(localStorage.getItem(KEY)); } catch (error) {}
        window.setAppTheme = function(theme) {
          apply(theme);
          try {
            if (theme === "light" || theme === "dark") localStorage.setItem(KEY, theme);
            else localStorage.removeItem(KEY);
          } catch (error) {}
          changed();
        };
        window.addEventListener("storage", function(event) {
          if (event.key !== KEY) return;
          apply(event.newValue);
          changed();
        });
      })();
    </script>`;

export function renderThemePicker(): string {
  const options = THEME_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");

  return `
        <label class="inline-flex items-center gap-8 text-muted">
          <i class="bi bi-palette" aria-hidden="true"></i>
          <span>Look</span>
          <select class="form-control" data-theme-picker aria-label="Choose the app's look">${options}</select>
        </label>
        <script>
          (function() {
            var picker = document.querySelector("[data-theme-picker]");
            if (!picker || !window.setAppTheme) return;
            function sync() {
              picker.value = document.documentElement.getAttribute("data-theme") || "";
            }
            sync();
            document.addEventListener("themechange", sync);
            picker.addEventListener("change", function() {
              window.setAppTheme(picker.value);
            });
          })();
        </script>`;
}
