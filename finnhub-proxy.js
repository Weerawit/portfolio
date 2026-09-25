export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    // 1. รองรับ Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 2. Health check เมื่อเปิด URL ตรงๆ ใน Browser (ป้องกัน Error 1200)
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        status: "ok",
        message: "Finnhub Proxy Worker is running successfully!"
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // 3. ป้องกันการเรียก path อื่นที่ไม่ใช่ API
    if (!url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Invalid path. Use /api/v1/..." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const targetUrl = `https://finnhub.io${url.pathname}${url.search}`;

    // 4. ตรวจสอบ Cache ก่อน (ถ้ามี)
    let cache = null;
    const cacheKey = new Request(url.toString(), request);
    try {
      cache = caches.default;
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const newHeaders = new Headers(cachedResponse.headers);
        newHeaders.set("Access-Control-Allow-Origin", "*");
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: newHeaders
        });
      }
    } catch (e) {
      // ข้ามถ้า cache มีปัญหา
    }

    // 5. ส่งคำขอไปยัง Finnhub
    let response;
    try {
      response = await fetch(targetUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; PortfolioProxy/1.0)"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Fetch upstream failed", details: String(err) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 6. ถ้าสำเร็จ ให้บันทึกลง Cache (Quotes 60s, Profiles 24 ชั่วโมง)
    if (response.status === 200 && cache) {
      const ttl = url.pathname.includes("profile") ? 86400 : 60;
      const responseToCache = new Response(response.body, response);
      responseToCache.headers.set("Cache-Control", `public, max-age=${ttl}`);
      responseToCache.headers.set("Access-Control-Allow-Origin", "*");

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
      }
      return responseToCache;
    }

    // 7. กรณีติด Error อื่นๆ (เช่น 429) ให้ส่งกลับพร้อม CORS Header
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
