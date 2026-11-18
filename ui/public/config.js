// Where the browser finds the two services (ui/lib/api.ts). These are the
// local values for docker compose. The deploy pipeline overwrites this file
// in the built site with the Azure URLs, so the same build runs everywhere.
window.PIANOGO_CONFIG = {
  libraryUrl: "http://localhost:8001",
  processingUrl: "http://localhost:8002",
};
