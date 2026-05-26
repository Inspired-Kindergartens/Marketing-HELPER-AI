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
    { label: "Marketing", description: "Infocare, Meta Ads & Google Analytics", href: "/app", primary: true },
    { label: "Communications", description: "Postmark, Mailchimp & Formstack", href: "/comms", primary: false },
  ];

  const secondaryTiles = [
    { label: "Marketing Demo", href: "/app?demo=1", external: false },
    { label: "Comms Demo", href: "/comms?demo=1", external: false },
    { label: "Read Me", href: "/readme", external: false },
    { label: "SharePoint", href: "https://ikindergartens.sharepoint.com/", external: true },
    { label: "Website", href: "https://inspiredkindergartens.nz/admin/", external: true },
  ];

  const placeholderTiles: string[] = [];

  const secondaryTileRow = secondaryTiles
    .map(
      (tile) => `
        <a class="landing-tile landing-tile--link" href="${escapeHtml(tile.href)}"${tile.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
          <span>${escapeHtml(tile.label)}</span>
        </a>
      `,
    )
    .join("");

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
        ${secondaryTileRow}
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
