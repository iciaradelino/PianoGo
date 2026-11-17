// Where the browser finds the two services. These are the local values for
// docker compose; the deploy pipeline writes its own config.js with the Azure
// URLs, so nothing here is hardcoded into the UI.
window.PIANOGO_CONFIG = {
  libraryUrl: "http://localhost:8001",
  processingUrl: "http://localhost:8002",
};
