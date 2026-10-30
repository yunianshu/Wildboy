const fs = require("node:fs");
const path = require("node:path");
const { connectWeChat } = require("./wechat-session.cjs");
const apiOrigin = process.env.WILDBOY_LOCAL_API || "http://127.0.0.1:8080";

(async () => {
  const output = path.resolve(__dirname, "../../test-results/wechat");
  fs.mkdirSync(output, { recursive: true });
  const exceptions = [];
  const report = [];
  const miniProgram = await connectWeChat();
  miniProgram.on("exception", (error) => exceptions.push(String(error)));
  try {
    await miniProgram.reLaunch("/pages/activities/index");
    for (const name of ["home", "activities", "mine", "shop"]) {
      const page = await miniProgram.switchTab(`/pages/${name}/index`);
      await page.waitFor(1500);
      await miniProgram.screenshot({ path: path.join(output, `${name}.png`) });
      const data = await page.data();
      if (["home", "activities", "shop"].includes(name) && !data.items.length)
        throw new Error(`${name} did not load real API data: ${data.error}`);
      report.push({ page: name, path: page.path, data });
      console.log(`PASS native ${name}`);
    }
    const response = await fetch(`${apiOrigin}/api/v1/shop/products`);
    if (!response.ok) throw new Error(`Product API ${response.status}`);
    const products = await response.json();
    if (!products.length) throw new Error("No products available for native checkout test");
    const activityResponse = await fetch(`${apiOrigin}/api/v1/activities?page=0&size=1`);
    const activityPage = await activityResponse.json();
    if (!activityPage.items.length) throw new Error("No activity available for native detail test");
    for (const route of [
      { name: "detail", url: `/pages/detail/index?id=${activityPage.items[0].id}` },
      { name: "product", url: `/pages/product/index?id=${products[0].id}` },
      { name: "checkout", url: `/pages/checkout/index?id=${products[0].id}&quantity=1` },
      { name: "orders", url: "/pages/orders/index" },
    ]) {
      const page = await miniProgram.reLaunch(route.url);
      await page.waitFor(1500);
      await miniProgram.screenshot({ path: path.join(output, `${route.name}.png`) });
      let data = await page.data();
      if (route.name === "detail") {
        if (!data.activity) throw new Error("Activity detail did not load real data");
        await miniProgram.pageScrollTo(1200);
        await page.waitFor(500);
        await miniProgram.screenshot({ path: path.join(output, "detail-sections.png") });
      }
      if (route.name === "product" && !data.product) throw new Error("Product did not load");
      if (route.name === "checkout") {
        const loginResponse = await fetch(`${apiOrigin}/api/v1/auth/dev-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "USER",
            privacyVersion: data.legal.privacy.version,
            termsVersion: data.legal.terms.version,
          }),
        });
        if (!loginResponse.ok) throw new Error(`Native dev login failed: ${loginResponse.status}`);
        const login = await loginResponse.json();
        await miniProgram.callWxMethod("setStorageSync", "wildboy-session", login.token);
        const addressResponse = await fetch(`${apiOrigin}/api/v1/me/addresses`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
          body: JSON.stringify({
            recipientName: "原生验收",
            phone: "13800000000",
            address: "厦门市微信开发者工具隔离测试地址",
            isDefault: true,
          }),
        });
        if (!addressResponse.ok) throw new Error(`Native address fixture failed: ${addressResponse.status}`);
        const savedAddress = await addressResponse.json();
        await page.callMethod("refreshAddress");
        if ((await page.data()).selectedAddressId !== savedAddress.id)
          throw new Error("Native checkout did not select the real saved shipping address");
        await page.setData({
          consent: true,
          privacyRead: true,
          termsRead: true,
        });
        await page.callMethod("submit");
        await page.waitFor(2000);
        data = await page.data();
        if (!data.order || data.order.status !== "PENDING_PAYMENT")
          throw new Error(`Native checkout did not retain a pending order: ${data.error}`);
        if (!data.error.includes("真实微信")) throw new Error(`Unexpected payment result: ${data.error}`);
        await miniProgram.screenshot({ path: path.join(output, "checkout-pending.png") });
      }
      if (route.name === "orders" && (!data.loggedIn || !data.items.length))
        throw new Error("Native order list did not show the submitted order");
      report.push({ page: route.name, path: page.path, data });
      console.log(`PASS native ${route.name}`);
    }
    fs.writeFileSync(path.join(output, "layout-report.json"), JSON.stringify({ exceptions, report }, null, 2));
    if (exceptions.length) throw new Error(exceptions.join("\n"));
    console.log("PASS WeChat DevTools native home/activities/mine/shop/detail/product/checkout/orders screenshots");
  } finally {
    await miniProgram.disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
