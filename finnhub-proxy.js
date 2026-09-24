export default {
  async fetch(request, env, ctx) {
    // 1. รองรับ Preflight CORS
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
    const targetUrl = `https://finnhub.io${url.pathname}${url.search}`;

    // 2. ตรวจสอบ Cloudflare Cache ก่อน (เพื่อไม่ให้เปลือง request ไป Finnhub)
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      const newHeaders = new Headers(cachedResponse.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: newHeaders
      });
    }

    // 3. ยิงไปขอข้อมูลจาก Finnhub
    const response = await fetch(targetUrl);

    // 4. บันทึกลงแคชเฉพาะคำขอที่สำเร็จ (HTTP 200)
    if (response.status === 200) {
      // Quotes แคชไว้ 60 วินาที, Profile บริษัทแคชไว้ 24 ชั่วโมง
      const ttl = url.pathname.includes("profile") ? 86400 : 60;
      const responseToCache = new Response(response.body, response);
      responseToCache.headers.set("Cache-Control", `public, max-age=${ttl}`);
      responseToCache.headers.set("Access-Control-Allow-Origin", "*");

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
      }
      return responseToCache;
    }

    // 5. กรณีติด Error (เช่น 429 Rate Limit) ให้ส่งกลับพร้อม CORS Header
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
