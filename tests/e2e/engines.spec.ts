import { test, expect, chromium } from "@playwright/test";
test("OpenCV detects varied backgrounds and applies eight distinct pixel pipelines", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium");
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const worker = new Worker(new URL("vendor/processor.js", location.href));
    let id = 0;
    const call = (data: Record<string, unknown>) =>
      new Promise<any>((resolve, reject) => {
        const key = ++id;
        const listener = (e: MessageEvent) => {
          if (e.data.id !== key) return;
          worker.removeEventListener("message", listener);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.result);
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ id: key, ...data });
      });
    const scenarios = [];
    for (const bg of ["#27382d", "#d9ddd9"]) {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 800;
      const x = c.getContext("2d")!;
      x.fillStyle = bg;
      x.fillRect(0, 0, 640, 800);
      x.beginPath();
      x.moveTo(95, 80);
      x.lineTo(570, 55);
      x.lineTo(535, 730);
      x.lineTo(70, 680);
      x.closePath();
      x.fillStyle = "#fffdf5";
      x.fill();
      x.fillStyle = "#222";
      x.font = "24px Arial";
      for (let i = 0; i < 10; i++)
        x.fillText("Document text " + i, 130, 170 + i * 40);
      scenarios.push(
        await call({ action: "detect", image: x.getImageData(0, 0, 640, 800) }),
      );
    }
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 600;
    const x = c.getContext("2d")!;
    const gradient = x.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, "#9b988a");
    gradient.addColorStop(1, "#fffdf5");
    x.fillStyle = gradient;
    x.fillRect(0, 0, 400, 600);
    x.fillStyle = "#1a2430";
    x.font = "24px Arial";
    for (let i = 0; i < 7; i++) x.fillText("Fine text " + i, 35, 100 + i * 40);
    x.fillStyle = "#365cac";
    x.fillRect(60, 430, 100, 45);
    const image = x.getImageData(0, 0, 400, 600),
      modes = [
        "auto",
        "clean",
        "bw",
        "gray",
        "color",
        "original",
        "receipt",
        "whiteboard",
      ];
    const outputs = [];
    for (const mode of modes) {
      const result = await call({
        action: "process",
        image,
        edits: {
          corners: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          rotation: 0,
          mode,
          brightness: 0,
          contrast: 0,
          sharpness: 25,
        },
      });
      let hash = 0,
        color = 0;
      for (let i = 0; i < result.data.length; i += 4) {
        hash =
          (Math.imul(hash, 31) +
            result.data[i] +
            result.data[i + 1] * 3 +
            result.data[i + 2] * 5) |
          0;
        color += Math.abs(result.data[i] - result.data[i + 2]);
      }
      outputs.push({
        mode,
        hash,
        color,
        width: result.width,
        height: result.height,
      });
    }
    worker.terminate();
    return { scenarios, outputs };
  });
  expect(results.scenarios.every((d) => d.confidence > 0.5)).toBe(true);
  expect(new Set(results.outputs.map((d) => d.hash)).size).toBe(8);
  for (const mode of ["gray", "bw", "receipt"])
    expect(results.outputs.find((d) => d.mode === mode)!.color).toBe(0);
  expect(
    results.outputs.find((d) => d.mode === "clean")!.color,
  ).toBeGreaterThan(0);
});
test("real camera API capture flows through processing and releases camera tracks", async ({}, info) => {
  test.skip(info.project.name !== "chromium");
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const media = await original(constraints);
        (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks =
          media.getTracks();
        return media;
      };
    });
    await page.goto("http://127.0.0.1:4173/");
    await page
      .getByRole("button", { name: "Scan Document Use your camera" })
      .click();
    await page
      .getByRole("button", { name: "Auto capture", exact: true })
      .click();
    await expect(page.locator("video")).toBeVisible();
    await page.waitForFunction(
      () => document.querySelector("video")!.videoWidth > 0,
    );
    await page
      .getByRole("button", { name: "Capture page", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Done, 1 pages" }),
    ).toBeEnabled({ timeout: 90000 });
    await page.getByRole("button", { name: "Done, 1 pages" }).click();
    await expect(
      page.getByRole("img", { name: "Processed document", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { testTracks: MediaStreamTrack[] }
        ).testTracks.every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    await page
      .getByRole("button", { name: "Generate PDF", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Download PDF", exact: true }),
    ).toBeVisible();
  } finally {
    await browser.close();
  }
});
for (const { code, text, word } of [
  { code: "heb", text: "מסמך פרטי בעברית", word: "מסמך" },
  { code: "ara", text: "وثيقة خاصة باللغة العربية", word: "وثيقة" },
])
  test(`local ${code} recognition and searchable export`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "chromium");
    await page.goto("/");
    const image = await page.evaluate((text) => {
      const c = document.createElement("canvas");
      c.width = 1100;
      c.height = 700;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      x.font = "64px Arial";
      x.fillStyle = "#111";
      x.direction = "rtl";
      x.textAlign = "right";
      x.fillText(text, 1020, 150);
      x.font = "40px Arial";
      x.fillText("12345", 1020, 250);
      return c.toDataURL("image/png").split(",")[1];
    }, text);
    await page
      .getByTestId("image-import")
      .setInputFiles({
        name: `${code}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
    await expect(
      page.getByRole("img", { name: "Processed document", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "English", exact: true })
      .uncheck();
    await page
      .getByRole("checkbox", {
        name: code === "heb" ? "עברית · Hebrew" : "العربية · Arabic",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Recognize text", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Extracted text" }),
    ).toHaveValue(new RegExp(word), { timeout: 120000 });
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    await page.getByRole("checkbox", { name: /Searchable PDF/ }).check();
    await page
      .getByRole("button", { name: "Generate PDF", exact: true })
      .click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PDF", exact: true }).click(),
    ]);
    await download.saveAs(info.outputPath(`${code}-searchable.pdf`));
  });
