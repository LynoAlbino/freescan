import { test, expect, chromium } from "@playwright/test";

test("finds the paper edges rather than its printed border, including faint paper and receipts", async ({
  page,
}, info) => {
  test.skip(!["chromium", "mobile-safari"].includes(info.project.name));
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const worker = new Worker(new URL("vendor/processor.js", location.href));
    let id = 0;
    const call = (image: ImageData, action = "detect", edits?: unknown) =>
      new Promise<any>((resolve, reject) => {
        const key = ++id;
        const listener = (e: MessageEvent) => {
          if (e.data.id !== key) return;
          worker.removeEventListener("message", listener);
          e.data.error
            ? reject(new Error(e.data.error))
            : resolve(e.data.result);
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ id: key, action, image, edits });
      });
    const scenes = [
      { name: "dark desk", bg: "#343830", paper: "#fffdf7" },
      { name: "faint edges", bg: "#e3e3e3", paper: "#f7f7f7" },
      {
        name: "printed inner border",
        bg: "#e3e3e3",
        paper: "#f7f7f7",
        border: true,
      },
      { name: "shadow", bg: "#645348", paper: "#fffdf7", shadow: true },
      { name: "receipt", bg: "#484e51", paper: "#fffdf7", receipt: true },
      { name: "colored paper", bg: "#343830", paper: "#e9d58c" },
    ];
    const results = [];
    const gallery = document.createElement("main");
    gallery.style.cssText =
      "background:white;color:#111;padding:20px;font:16px Arial";
    for (const scene of scenes) {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 640;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = scene.bg;
      ctx.fillRect(0, 0, c.width, c.height);
      const points = scene.receipt
        ? [
            [210, 95],
            [263, 98],
            [270, 540],
            [205, 535],
          ]
        : [
            [65, 65],
            [420, 90],
            [395, 575],
            [45, 545],
          ];
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = scene.paper;
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (scene.shadow) {
        const g = ctx.createLinearGradient(70, 0, 420, 0);
        g.addColorStop(0, "#0009");
        g.addColorStop(0.65, "#0000");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 480, 640);
      }
      ctx.fillStyle = "#222";
      ctx.font = "15px Arial";
      for (let i = 0; i < 14; i++)
        ctx.fillText(
          "Scan text 123456",
          scene.receipt ? 214 : 100,
          145 + i * 25,
        );
      if (scene.border) {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 3;
        ctx.strokeRect(95, 120, 270, 370);
      }
      ctx.restore();
      const image = ctx.getImageData(0, 0, c.width, c.height);
      const start = performance.now();
      const d = await call(image);
      const ms = performance.now() - start;
      const maxError = Math.max(
        ...points.map(([x, y], i) =>
          Math.hypot(d.corners[i].x - x / 480, d.corners[i].y - y / 640),
        ),
      );
      const measurement = {
        name: scene.name,
        confidence: d.confidence,
        maxError,
        ms,
        corners: d.corners,
        shadowBackground: 255,
      };
      const output = await call(image, "process", {
        corners: d.corners,
        rotation: 0,
        mode: "auto",
        brightness: 0,
        contrast: 0,
        sharpness: 12,
      });
      if (scene.shadow) {
        let sum = 0,
          count = 0;
        for (
          let y = Math.floor(output.height * 0.88);
          y < output.height * 0.94;
          y++
        )
          for (
            let x = Math.floor(output.width * 0.1);
            x < output.width * 0.18;
            x++
          ) {
            const i = (y * output.width + x) * 4;
            sum +=
              (output.data[i] + output.data[i + 1] + output.data[i + 2]) / 3;
            count++;
          }
        measurement.shadowBackground = sum / count;
      }
      results.push(measurement);
      const processed = document.createElement("canvas");
      processed.width = output.width;
      processed.height = output.height;
      processed
        .getContext("2d")!
        .putImageData(
          new ImageData(output.data, output.width, output.height),
          0,
          0,
        );
      const title = document.createElement("h2");
      title.textContent = scene.name;
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;gap:20px;align-items:center;margin-bottom:20px";
      c.style.cssText = processed.style.cssText =
        "max-width:45%;max-height:320px;object-fit:contain";
      row.append(c, processed);
      gallery.append(title, row);
    }
    const empty = new ImageData(480, 640);
    empty.data.fill(240);
    const noDocument = await call(empty);
    worker.terminate();
    document.body.replaceChildren(gallery);
    return { scenes: results, noDocument };
  });
  console.log(JSON.stringify(results));
  await page.screenshot({
    path: info.outputPath("detection-and-crop.png"),
    fullPage: true,
  });
  for (const scene of results.scenes) {
    expect(scene.confidence, scene.name).toBeGreaterThan(0.5);
    expect(scene.maxError, scene.name).toBeLessThan(0.035);
    expect(
      scene.shadowBackground,
      `${scene.name}: remove the dark edge shadow`,
    ).toBeGreaterThan(225);
  }
  expect(results.noDocument.confidence).toBeLessThan(0.5);
});

test("live guidance reacts promptly and the outline fits a landscape camera on a portrait phone", async ({}, info) => {
  test.skip(info.project.name !== "chromium");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d")!;
      const scene = (far: boolean) => {
        ctx.fillStyle = "#343830";
        ctx.fillRect(0, 0, c.width, c.height);
        const width = far ? 210 : 425,
          height = far ? 300 : 610;
        const x = (c.width - width) / 2,
          y = (c.height - height) / 2;
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = "#222";
        ctx.font = far ? "10px Arial" : "24px Arial";
        for (let i = 0; i < 12; i++)
          ctx.fillText(
            "Clear document text 123",
            x + 15,
            y + 35 + (i * height) / 15,
          );
      };
      (window as any).setCameraScene = scene;
      scene(true);
      navigator.mediaDevices.getUserMedia = async () => {
        const stream = c.captureStream(30);
        scene(true);
        return stream;
      };
    });
    await page.goto("http://127.0.0.1:4173/");
    await page
      .getByRole("button", { name: "Scan Document Use your camera" })
      .click();
    await expect(page.getByText("Move closer", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Done, 0 pages" }),
    ).toBeDisabled();
    const geometry = await page.locator(".video-wrap").evaluate((el) => {
      const r = el.getBoundingClientRect(),
        video = el.querySelector("video")!,
        overlay = el.querySelector("svg")!.getBoundingClientRect();
      return {
        ratio: r.width / r.height,
        sourceRatio: video.videoWidth / video.videoHeight,
        overlayWidth: overlay.width,
        overlayHeight: overlay.height,
        width: r.width,
        height: r.height,
      };
    });
    expect(geometry.ratio).toBeCloseTo(geometry.sourceRatio, 3);
    expect(geometry.overlayHeight).toBeCloseTo(geometry.height, 1);
    expect(geometry.overlayWidth).toBeCloseTo(geometry.width, 1);
    // Keep capture manual while measuring detection responsiveness, then re-enable it.
    await page
      .getByRole("button", { name: "Auto capture", exact: true })
      .click();
    const started = Date.now();
    await page.evaluate(() => (window as any).setCameraScene(false));
    await expect(
      page.locator('.camera-guidance[data-ready="true"]'),
    ).toBeVisible({ timeout: 1500 });
    console.log(`Live camera guidance updated in ${Date.now() - started} ms`);
    await page.screenshot({
      path: info.outputPath("live-camera-guidance.png"),
    });
    await page
      .getByRole("button", { name: "Manual capture", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Done, 1 pages" }),
    ).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Done, 1 pages" }).click();
    const dimensions = await page
      .getByRole("img", { name: "Processed document", exact: true })
      .evaluate(async (el: HTMLImageElement) => {
        await el.decode();
        return { width: el.naturalWidth, height: el.naturalHeight };
      });
    expect(dimensions.width).toBeGreaterThan(400);
    expect(dimensions.width).toBeLessThan(450);
    expect(dimensions.height).toBeGreaterThan(590);
    expect(dimensions.height).toBeLessThan(630);
  } catch (error) {
    console.log(await page.locator("body").innerText());
    await page.screenshot({ path: info.outputPath("camera-failure.png") });
    throw error;
  } finally {
    await browser.close();
  }
});
