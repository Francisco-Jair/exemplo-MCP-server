import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";


const server = new McpServer({
    name: "servidor-clima",
    version: "1.0.0"
});


// Registrar ferramenta de clima usando API gratuita
server.tool(
    "obter_clima",
    "Buscar o clima e a temperatura atual de um local usando latitude e longitude",
    {
        latitude: z.coerce.number().describe("Latitude do local"),
        longitude: z.coerce.number().describe("Longitude do local")
    },
    async ({latitude, longitude}) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
        const response = await fetch(url);

        if (!response.ok) {
            return {content:[{type:"text", text:`Erro ao buscar o clima: ${response.statusText}`}]};
        }

        const data = await response.json();
        const clima = data.current_weather;

        return {
            content : [
                {
                    type : "text",
                    text : `O clima atual é ${clima.temperature}°C com ${clima.windspeed} km/h de velocidade do vento.`
                }
            ]
        }
    }
)

server.tool(
    "obter_clima_por_cidade",
    {
        description: "Buscar o clima atual de uma cidade usando a API de geocodificação e a API de clima",
    },
    {
        cidade: z.string().describe("Nome da cidade. Para maior precisão na busca, SEMPRE adicione o estado e país correspondentes ao nome da cidade. Ex: 'Teresina, Piauí, Brasil'")
    },
    async ({cidade}) => {
        try {
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt`;
            const geoResponse = await fetch(geoUrl);
            const geoData = await geoResponse.json();

            if (!geoResponse.ok || !geoData.results || geoData.results.length === 0) {
                return {content:[{type:"text", text:`Erro ao buscar a cidade: ${geoResponse.statusText}`}]};
            }

            const { latitude, longitude, name, admin1, country } = geoData.results[0];
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
            const response = await fetch(url);

            if (!response.ok) {
                return {content:[{type:"text", text:`Erro ao buscar o clima: ${response.statusText}`}]};
            }

            const data = await response.json();
            const clima = data.current_weather;

            const localFormatado = `${name} (${admin1 || country})`;
            
            return {
                content : [
                    {
                        type : "text",
                        text: `[Cidade: ${localFormatado}] Temperatura: ${clima.temperature}°C, Vento: ${clima.windspeed} km/h`
                    }
                ]
            } 
        } catch (error) {
            console.error("\n[ERRO NO SERVIDOR MCP]:", error);
            return { content: [{ type: "text", text: "Erro ao consultar a API de clima por cidade." }] };
        }
    }
)


// ---------------------------------------------------------
// Inicialização do Servidor
// ---------------------------------------------------------

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Servidor MCP de clima rodando via STDIO...");
}

main().catch(console.error);