import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexHtmlPath = path.join(__dirname, "dist", "index.html");
const stationsPageTsPath = path.join(
  __dirname,
  "..",
  "fuelnaija-bot",
  "fuelnaija-bot-worker",
  "src",
  "endpoints",
  "stationsPage.ts",
);

const htmlContent = fs.readFileSync(indexHtmlPath, "utf8");

// Escape backticks and dollar signs to avoid breaking the TS template string
const safeHtmlContent = htmlContent.replace(/`/g, "\\`").replace(/\$/g, "\\$");

const newTsContent = `export const getStationsHtml = (apiKey: string) => \`
${safeHtmlContent}
\`;
`;

fs.writeFileSync(stationsPageTsPath, newTsContent, "utf8");
console.log("Successfully injected HTML into stationsPage.ts");
