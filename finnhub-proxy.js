    export default {
      async fetch(request) {
        // รองรับ Preflight CORS
        if (request.method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "*"
            }
          });
        }

        const url = new URL(request.url);
        // ส่งต่อไปยัง Finnhub
        const targetUrl = `https://finnhub.io${url.pathname}${url.search}`;
        const response = await fetch(targetUrl);

        // ส่งผลลัพธ์กลับพร้อม Header CORS
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Access-Control-Allow-Origin", "*");

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }
    };
