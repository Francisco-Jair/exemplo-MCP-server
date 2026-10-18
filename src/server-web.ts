import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { z } from 'zod';


const app = express();
app.use(cors());
// app.use(express.json());


const sessions = new Map();


function createServerMCP(){

    const server = new McpServer({
        name: "servidor-informacoes",
        version: "1.0.0"
    });


    // Registrar ferramenta de clima usando API gratuita
    server.registerTool(
        "obter_clima",
        {
            description:
                "Buscar o clima e a temperatura atual de um local usando latitude e longitude",

            inputSchema: z.object({
                latitude: z.coerce
                    .number()
                    .describe("Latitude do local"),

                longitude: z.coerce
                    .number()
                    .describe("Longitude do local")
            })
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

    server.registerTool(
        "obter_clima_por_cidade",
        {
            description:
                "Buscar o clima atual de uma cidade usando a API de geocodificação e a API de clima",

            inputSchema: z.object({
                cidade: z.string().describe("Nome da cidade para buscar o clima")
            })
        },

        async ({ cidade }) => {
            try {
                const geoUrl =
                    `https://geocoding-api.open-meteo.com/v1/search` +
                    `?name=${encodeURIComponent(cidade)}` +
                    `&count=1` +
                    `&language=pt`;

                const geoResponse = await fetch(geoUrl);

                if (!geoResponse.ok) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Erro ao buscar a cidade: ${geoResponse.statusText}`
                            }
                        ],
                        isError: true
                    };
                }

                const geoData = await geoResponse.json() as {
                    results?: Array<{
                        latitude: number;
                        longitude: number;
                        name: string;
                        admin1?: string;
                        country: string;
                    }>;
                };

                if (!geoData.results || geoData.results.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Cidade "${cidade}" não encontrada.`
                            }
                        ],
                        isError: true
                    };
                }

                const {
                    latitude,
                    longitude,
                    name,
                    admin1,
                    country
                } = geoData.results[0];

                const weatherUrl =
                    `https://api.open-meteo.com/v1/forecast` +
                    `?latitude=${latitude}` +
                    `&longitude=${longitude}` +
                    `&current_weather=true`;

                const response = await fetch(weatherUrl);

                if (!response.ok) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Erro ao buscar o clima: ${response.statusText}`
                            }
                        ],
                        isError: true
                    };
                }

                const data = await response.json() as {
                    current_weather: {
                        temperature: number;
                        windspeed: number;
                    };
                };

                const clima = data.current_weather;

                const localFormatado = `${name} (${admin1 || country})`;

                return {
                    content: [
                        {
                            type: "text",
                            text:
                                `[Cidade: ${localFormatado}] ` +
                                `Temperatura: ${clima.temperature}°C, ` +
                                `Vento: ${clima.windspeed} km/h`
                        }
                    ]
                };

            } catch (error) {
                console.error("[ERRO NO SERVIDOR MCP]:", error);

                return {
                    content: [
                        {
                            type: "text",
                            text: "Erro ao consultar a API de clima por cidade."
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // ---------------------------------------------------------
    // Ferramenta: Modificar ou Criar Códigos/Arquivos
    // ---------------------------------------------------------
    server.tool(
        "salvar_codigo",
        "Salva ou substitui um arquivo de código no computador",
        {
            nomeArquivo: z.string().describe("Nome do arquivo com a extensão (ex: script.js, index.html)"),
            conteudo: z.string().describe("O código completo que será salvo no arquivo")
        },
        async ({ nomeArquivo, conteudo }) => {
            try {
                // Define a pasta onde os arquivos serão salvos (ex: uma pasta 'outputs' na raiz do projeto)
                const caminhoDestino = path.join(process.cwd(), 'outputs', nomeArquivo);
                
                // Cria a pasta se não existir
                if (!fs.existsSync(path.dirname(caminhoDestino))) {
                    fs.mkdirSync(path.dirname(caminhoDestino), { recursive: true });
                }

                // Escreve o arquivo no HD
                fs.writeFileSync(caminhoDestino, conteudo, 'utf-8');

                return {
                    content: [{ type: "text", text: `Sucesso: O arquivo ${nomeArquivo} foi salvo em ${caminhoDestino}` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Erro ao salvar o arquivo: ${error.message}` }]
                };
            }
        }
    );

    // ---------------------------------------------------------
    // Ferramenta: Criar PDF
    // ---------------------------------------------------------
    server.tool(
        "gerar_pdf",
        "Cria um documento PDF com o texto fornecido",
        {
            titulo: z.string().describe("O título do documento PDF"),
            texto: z.string().describe("O conteúdo principal do PDF")
        },
        async ({ titulo, texto }) => {
            try {
                const nomeArquivo = `${titulo.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
                const caminhoDestino = path.join(process.cwd(), 'outputs', nomeArquivo);

                if (!fs.existsSync(path.dirname(caminhoDestino))) {
                    fs.mkdirSync(path.dirname(caminhoDestino), { recursive: true });
                }

                // Usa o PDFKit para gerar o arquivo
                return new Promise((resolve) => {
                    const doc = new PDFDocument();
                    const stream = fs.createWriteStream(caminhoDestino);
                    
                    doc.pipe(stream);
                    doc.fontSize(20).text(titulo, { align: 'center' });
                    doc.moveDown();
                    doc.fontSize(12).text(texto);
                    doc.end();

                    stream.on('finish', () => {
                        resolve({
                            content: [{ type: "text", text: `PDF criado com sucesso em: ${caminhoDestino}` }]
                        });
                    });
                });
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Erro ao criar PDF: ${error.message}` }]
                };
            }
        }
    );

    return server;
}

// ---------------------------------------------------------
// Endpoint HTTP para o servidor MCP
// ---------------------------------------------------------

app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string || undefined;
    let transport: StreamableHTTPServerTransport;


    // recuperar o transporte da sessão ou criar um novo
    if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId)!;
    }else {
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {sessions.set(id, transport)},
        });

        transport.onclose = () => {
            if (transport.sessionId){
                sessions.delete(transport.sessionId);
            }
        }
        
        // Liga as ferramentas ao transporte da sessão atual
        const server = createServerMCP();
        await server.connect(transport);
    }

    // O transporte interno trata de processar e responder ao cliente
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    await transport.handleRequest(req, res, rawBody);
});

// ---------------------------------------------------------
// Inicialização do Servidor
// ---------------------------------------------------------


app.listen(8080, () => {
  console.log("Servidor MCP Web a correr na porta 8080 (Streamable HTTP)...");
  console.log("Endpoint para os clientes apontarem: POST http://localhost:8080/mcp");
});