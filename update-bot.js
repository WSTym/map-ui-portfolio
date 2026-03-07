import fs from "node:fs";

let html = fs.readFileSync("dist/index.html", "utf8");
html = html.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const outContent = `import { OpenAPIRoute } from "chanfana";
import type { AppContext } from "../types";

export class StationsPageGet extends OpenAPIRoute {
    schema = {
        tags: ["Page"],
        summary: "Returns the main fuelnaija map application",
        responses: {
            "200": {
                description: "HTML Page",
                content: {
                    "text/html": {
                        schema: {
                            type: "string",
                        },
                    },
                },
            },
        },
    };

    async handle(c: AppContext) {
        // Obter de fallback
        const html = \`${html}\`;
        
        return c.html(html);
    }
}
`;

const outPath =
  "../fuelnaija-bot/fuelnaija-bot-worker/src/endpoints/stationsPage.ts";
fs.writeFileSync(outPath, outContent);
console.log("Update complete");
