/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { PineconeClient } from "@pinecone-database/pinecone";
import { Configuration, OpenAIApi } from "openai";
import fetchAdapter from '@vespaiach/axios-fetch-adapter'



export default {
  async fetch(request,env,ctx) {
    console.log(env.PINECONE_INDEX);
    console.log("start");
    if (request.method === 'OPTIONS') {
      return new Response('accept', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '600'
        },
      });
    }
    if (request.method === 'POST') {
      console.log("json dealing")
      const contentType = request.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await request.json();
          // 处理接收到的JSON数据
          console.log('Received JSON:', data);
          const question = data['questionJson'];
          if (question == null || question == "") {
            return new Response('Invalid value', { status: 400 });
          }
          const result = await chatReply(env,question);
          console.log(result);
          return new Response(JSON.stringify({ message: result }), {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
          });
        } catch (error) {
          return new Response('Invalid JSON', { status: 400 });
        }
      } else {
        return new Response('Invalid content-type', { status: 400 });
      }
    } else {
      return new Response('Method not allowed', { status: 405 });
    }
  },
};

async function chatReply(env,question) {

  const pinecone = new PineconeClient();
  var queryEmbedding;
  var queryResponse;
  var result;
  console.log("1......start pinecone");
  const configuration = new Configuration({
    apiKey: env.OPENAI_API_KEY,
    baseOptions: {
      adapter: fetchAdapter
    }
  });
  const openai = new OpenAIApi(configuration);
  console.log("2......start openai");
  try {
    await pinecone.init({
      apiKey: env.PINECONE_API_KEY,
      environment: env.PINECONE_ENVIRONMENT,
    });
    console.log("3......pinecone init......time:" + new Date());
  } catch (error) {
    console.log(error);
    return error;
  }
  const index = pinecone.Index(env.PINECONE_INDEX);
  try {
    queryEmbedding = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: question,
    });
  } catch (error) {
    console.log(error);
    return error;
  }
  console.log("4......text embedding......time:" + new Date());
  try {
    queryResponse = await index.query({
      queryRequest: {
        topK: 10,
        vector: queryEmbedding['data']['data'][0]['embedding'],
        includeMetadata: true,
        includeValues: true,
        namespace: "demo1",
      },
    });
  } catch (error) {
    console.log(error);
    return error;
  }
  console.log(`Found ${queryResponse.matches.length} matches......time:` + new Date());
  var concatenatedPageContent = queryResponse.matches
    .map((match) => match.metadata.pageContent)
    .join(" ");
  try {
    result = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ "role": "user", "content": concatenatedPageContent }, { "role": "user", "content": question }]
    });
  } catch (error) {
    console.log(error);
    return error;
  }
  // Log the answer
  console.log(`Answer: ${result['data']['choices'][0]['message']['content']}......time:` + new Date());
  return (result['data']['choices'][0]['message']['content']);
}




