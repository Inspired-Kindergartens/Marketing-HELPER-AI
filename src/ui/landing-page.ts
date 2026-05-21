function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderLandingPage() {
  const tiles = [
    { label: "Online Marketing", description: "Dashboard for centres, waitlists, ads, and traffic.", href: "/app", primary: true },
    { label: "Demo", description: "Showcase the dashboard with fixture data.", href: "/app?demo=1", primary: false },
    { label: "Read Me", description: "Open the project README in the browser.", href: "/readme", primary: false },
  ];

  const placeholderTiles = Array.from({ length: 5 }).map(
    () => `<div class="landing-tile landing-tile--placeholder" aria-hidden="true"><span>Coming soon</span></div>`,
  );

  const buttonRow = tiles
    .map(
      (tile) => `
        <a class="landing-button${tile.primary ? " landing-button--primary" : ""}" href="${escapeHtml(tile.href)}">
          <span class="landing-button__label">${escapeHtml(tile.label)}</span>
          <span class="landing-button__description">${escapeHtml(tile.description)}</span>
        </a>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="landing-body">
    <main class="landing">
      <header class="landing__header">
        <h1 class="landing__title">Marketing Helper AI</h1>
      </header>
      <video class="landing__hero" autoplay muted playsinline preload="auto" aria-hidden="true">
        <source src="/assets/beepbeep-intro.mp4" type="video/mp4" />
      </video>
      <p class="landing__tagline">Local marketing &amp; enrolment intelligence for childcare centres.</p>
      <nav class="landing__buttons" aria-label="Primary navigation">
        ${buttonRow}
      </nav>
      <section class="landing__tiles" aria-label="Upcoming tools">
        ${placeholderTiles.join("")}
      </section>
      <footer class="landing__footer">
        <a class="landing__github" href="https://github.com/Inspired-Kindergartens/Marketing-HELPER-AI" target="_blank" rel="noopener noreferrer">
          <i class="bi bi-github" aria-hidden="true"></i>
          <span>View on GitHub</span>
        </a>
      </footer>
    </main>
  </body>
</html>`;
}
