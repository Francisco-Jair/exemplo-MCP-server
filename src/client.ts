import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// import { exec } from "node:child_process"; // Fazendo falar no MacOS
import ollama from "ollama";
import process from "process";
import * as readline from "readline/promises";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {

    // 1. Configurar o transporte para iniciar o Servidor MCP como um processo filho
    // const transport = new StdioClientTransport({command: "npx", args: ["tsx", "src/server.ts"]});
    const transport = new StreamableHTTPClientTransport(
        new URL("http://localhost:8080/mcp")
    );

    const mcpClient = new Client(
        {name : "meu-agente", version : "1.0.0"},
        {capabilities : {}},
    );


    // A partir do momento em que a ligação é estabelecida, o resto do seu código
    // (listTools, callTool, passagem para o Llama) permanece 100% inalterado!
    await mcpClient.connect(transport);
    
    console.log("Cliente MCP conectado ao servidor local");

    // 2. Buscar as ferramentas disponíveis no servidor MCP
    const toolsResponse = await mcpClient.listTools();

    // 3. Converter o formato do MCP para o formato que o ollaham entende
    const ollamaTools = toolsResponse.tools.map((t) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            // O MCP já usa JSON Schema nativamente, compatível com o Ollama
            parameters: t.inputSchema
        }
    }))


    // Criar a interface para ler o terminal
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\n-------------------------------------------------");
    const perguntaUsuario = await rl.question("Você: ");
    console.log("-------------------------------------------------\n");

  let messages: any[] = [
{
      role: "system",
      content: `Você é um assistente conectado a ferramentas de sistema.
REGRAS CRÍTICAS PARA CRIAÇÃO DE ARQUIVOS (PDF ou Código):
1. Você DEVE colocar 100% do conteúdo, código ou texto EXCLUSIVAMENTE dentro do parâmetro da ferramenta.
2. NUNCA resuma ou corte o conteúdo dentro do parâmetro. Se for um loop, escreva o loop inteiro no parâmetro.
3. NÃO imprima o código ou o texto na nossa conversa (chat). O usuário não quer ler o código aqui, ele quer o código dentro do arquivo físico.
4. Quando receber o resultado de uma ferramenta, use as informações para formular uma resposta curta confirmando o sucesso.`
    },
    { 
      role: "user", 
      content: perguntaUsuario
    }
  ];


    console.log("\n\nEnviando pergunta para o Ollama\n\n");
    const response = await ollama.chat({
        model: "llama3.2",
        messages: messages,
        tools: ollamaTools
    })

    // 4. Verifica se a IA decidiu usar a ferramenta de clima
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        console.log("O modelo chamou uma ferramenta:");
        
        // adicionando o pedido de uso da ferrramenta ao historico
        messages.push(response.message)

        for (const toolCall of response.message.tool_calls) {
            console.log(`Chamando ferramenta: ${toolCall.function.name}`);

            // 5. Enviar a chamada da ferramenta para o servidor MCP
            const mcpResult = await mcpClient.callTool({
                name: toolCall.function.name,
                arguments: toolCall.function.arguments as any
            });

            const textoExtraido = mcpResult.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");

            console.log("Resultado da API retornado para o Llama:", textoExtraido);

            // 6. Adiciona o resultado da ferramenta ao histórico como uma instrução direta
            messages.push({
                role: "user",
                content: `O sistema executou a ferramenta e obteve este resultado: "${textoExtraido}". Usando EXCLUSIVAMENTE essa informação, responda à minha pergunta original de forma natural.`
            });
        }

        // 7. Enviar a resposta da ferramenta de volta para o modelo
        const finalResponse = await ollama.chat({
            model: "llama3.2",
            messages: messages,
        });

        // Fazendo falar
        // const textoResposta = finalResponse.message.content;
        // const textoLimpo = textoResposta.replace(/["'\n]/g, ' ');
        // exec(`say -v "Luciana" "${textoLimpo}"`);

        console.log("\n\nResposta final do modelo:\n", finalResponse.message.content);
    }else{
        console.log("O modelo não chamou nenhuma ferramenta. Resposta direta:\n", response.message.content);
    }

    rl.close();
    process.exit(0);
}


main().catch(console.error);